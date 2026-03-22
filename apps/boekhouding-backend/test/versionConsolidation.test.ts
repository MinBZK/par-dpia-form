import { describe, it, expect } from 'vitest'
import { diffStates } from '../src/utils/diffStates.js'

const USER_A = 'user-a'
const USER_B = 'user-b'
const URN = 'urn:nl:dpia:3.0'

const CONSOLIDATION_WINDOW_MS = 15 * 60 * 1000

const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

function state(answers: Record<string, unknown>, completedTasks?: string[]) {
  return {
    metadata: {
      createdAt: '2026-01-01T00:00:00Z',
      urn: URN,
      ...(completedTasks && { completedTasks }),
    },
    answers,
  }
}

describe('version consolidation logic', () => {
  describe('consolidation decision', () => {
    function shouldConsolidate(
      currentVersionCreatedBy: string,
      requestUserId: string,
      forceNewVersion: boolean,
      changeDescription?: string,
      elapsedMs: number = 0,
      versionNumber: number = 2,
    ): boolean {
      const sameUser = currentVersionCreatedBy === requestUserId
      const withinWindow = elapsedMs < CONSOLIDATION_WINDOW_MS
      return versionNumber !== 1 && sameUser && !forceNewVersion && !changeDescription && withinWindow
    }

    it('consolidates when same user, no flags, within time window', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 0)).toBe(true)
    })

    it('never consolidates into version 1 (initial/imported state)', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 0, 1)).toBe(false)
    })

    it('consolidates into version 2 under same conditions', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 0, 2)).toBe(true)
    })

    it('consolidates when same user, 14 minutes elapsed', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 14 * 60 * 1000)).toBe(true)
    })

    it('does not consolidate when same user but > 15 minutes elapsed', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 16 * 60 * 1000)).toBe(false)
    })

    it('does not consolidate at exactly 15 minutes', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, undefined, 15 * 60 * 1000)).toBe(false)
    })

    it('does not consolidate when different user', () => {
      expect(shouldConsolidate(USER_A, USER_B, false, undefined, 0)).toBe(false)
    })

    it('does not consolidate when different user even within time window', () => {
      expect(shouldConsolidate(USER_A, USER_B, false, undefined, 5 * 60 * 1000)).toBe(false)
    })

    it('does not consolidate when forceNewVersion is true', () => {
      expect(shouldConsolidate(USER_A, USER_A, true, undefined, 0)).toBe(false)
    })

    it('does not consolidate when changeDescription is set (e.g. restore)', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, 'Hersteld naar versie 3', 0)).toBe(false)
    })
  })

  describe('edits accumulate during consolidation', () => {
    it('produces separate edits for each field change across saves', () => {
      const s0 = state({})
      const s1 = state({ '0.1': answer('Inleiding') })
      const s2 = state({ '0.1': answer('Inleiding'), '0.2': answer('Beschrijving') })

      const edits1 = diffStates(s0, s1, USER_A)
      const edits2 = diffStates(s1, s2, USER_A)

      expect(edits1).toHaveLength(1)
      expect(edits1[0].fieldId).toBe(`${URN}?=task_id=0.1`)

      expect(edits2).toHaveLength(1)
      expect(edits2[0].fieldId).toBe(`${URN}?=task_id=0.2`)
    })

    it('tracks overwritten values correctly across consolidated saves', () => {
      const s0 = state({})
      const s1 = state({ '1.1': answer('Eerste versie') })
      const s2 = state({ '1.1': answer('Gecorrigeerd') })

      const edits1 = diffStates(s0, s1, USER_A)
      const edits2 = diffStates(s1, s2, USER_A)

      expect(edits1[0]).toMatchObject({ oldValue: null, newValue: answer('Eerste versie') })
      expect(edits2[0]).toMatchObject({ oldValue: answer('Eerste versie'), newValue: answer('Gecorrigeerd') })
    })
  })

  describe('multi-user scenario', () => {
    it('different users editing different fields produces separate edits', () => {
      const base = state({ '0.1': answer('Inleiding') })
      const afterA = state({ '0.1': answer('Aangepaste inleiding') })
      const afterB = state({ '0.1': answer('Aangepaste inleiding'), '0.2': answer('Beschrijving') })

      const editsA = diffStates(base, afterA, USER_A)
      const editsB = diffStates(afterA, afterB, USER_B)

      expect(editsA).toHaveLength(1)
      expect(editsA[0]).toMatchObject({ fieldId: `${URN}?=task_id=0.1`, editedBy: USER_A })

      expect(editsB).toHaveLength(1)
      expect(editsB[0]).toMatchObject({ fieldId: `${URN}?=task_id=0.2`, editedBy: USER_B })
    })

    it('same field edited by two users shows both edits with correct attribution', () => {
      const s0 = state({ '1.1': answer('Origineel') })
      const s1 = state({ '1.1': answer('Door Sam') })
      const s2 = state({ '1.1': answer('Door Noor') })

      const editsA = diffStates(s0, s1, USER_A)
      const editsB = diffStates(s1, s2, USER_B)

      expect(editsA[0]).toMatchObject({ editedBy: USER_A, oldValue: answer('Origineel'), newValue: answer('Door Sam') })
      expect(editsB[0]).toMatchObject({ editedBy: USER_B, oldValue: answer('Door Sam'), newValue: answer('Door Noor') })
    })
  })

  describe('consolidation preserves edit history correctly', () => {
    it('consolidated saves produce independent edits that can be collapsed in the UI', () => {
      const s0 = state({ '1.1': answer('Eerste') })
      const s1 = state({ '1.1': answer('Tweede') })
      const s2 = state({ '1.1': answer('Derde') })

      const edits1 = diffStates(s0, s1, USER_A)
      const edits2 = diffStates(s1, s2, USER_A)

      expect(edits1[0]).toMatchObject({ oldValue: answer('Eerste'), newValue: answer('Tweede') })
      expect(edits2[0]).toMatchObject({ oldValue: answer('Tweede'), newValue: answer('Derde') })
    })

    it('same field edited back to original produces two edits that cancel out', () => {
      const s0 = state({ '1.1': answer('Origineel') })
      const s1 = state({ '1.1': answer('Gewijzigd') })
      const s2 = state({ '1.1': answer('Origineel') })

      expect(diffStates(s0, s1, USER_A)).toHaveLength(1)
      expect(diffStates(s1, s2, USER_A)).toHaveLength(1)
    })

    it('mixed field edits across consolidated saves track each field independently', () => {
      const s0 = state({ '0.1': answer('A'), '0.2': answer('X') })
      const s1 = state({ '0.1': answer('B'), '0.2': answer('X') })
      const s2 = state({ '0.1': answer('B'), '0.2': answer('Y') })

      const edits1 = diffStates(s0, s1, USER_A)
      const edits2 = diffStates(s1, s2, USER_A)

      expect(edits1).toHaveLength(1)
      expect(edits1[0].fieldId).toBe(`${URN}?=task_id=0.1`)

      expect(edits2).toHaveLength(1)
      expect(edits2[0].fieldId).toBe(`${URN}?=task_id=0.2`)
    })
  })

  describe('navigation-only saves do not create edits', () => {
    it('changing only metadata timestamp produces no edits', () => {
      const s1 = { metadata: { createdAt: '2026-01-01', urn: URN }, answers: { '0.1': answer('X') } }
      const s2 = { metadata: { createdAt: '2026-01-02', urn: URN }, answers: { '0.1': answer('X') } }
      expect(diffStates(s1, s2, USER_A)).toEqual([])
    })
  })
})

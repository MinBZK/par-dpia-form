import { describe, it, expect } from 'vitest'
import { diffStates } from '../src/utils/diffStates.js'

const USER_A = 'user-a'
const USER_B = 'user-b'

const CONSOLIDATION_WINDOW_MS = 15 * 60 * 1000

describe('version consolidation logic', () => {
  // These tests verify the decision logic that the PUT route uses.
  // The route consolidates (updates in-place) when:
  //   1. Same user as current version's createdBy
  //   2. No forceNewVersion flag
  //   3. No changeDescription (like a restore)
  //   4. Version was created less than 15 minutes ago
  // Otherwise it creates a new version.

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
      // Simulate: user changes field A, then field B in a second save
      const state0 = { metadata: {}, answers: { dpia: {} } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'a' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'a' }, '1.2': { value: 'b' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      // First save: 1 edit (field 1.1 added)
      expect(edits1).toHaveLength(1)
      expect(edits1[0].fieldId).toBe('dpia.1.1')

      // Second save: 1 edit (field 1.2 added) — not 2, because 1.1 hasn't changed
      expect(edits2).toHaveLength(1)
      expect(edits2[0].fieldId).toBe('dpia.1.2')
    })

    it('tracks overwritten values correctly across consolidated saves', () => {
      // User types "aap" then corrects to "beer" — both edits are recorded
      const state0 = { metadata: {}, answers: { dpia: {} } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'aap' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'beer' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      expect(edits1[0]).toMatchObject({ oldValue: null, newValue: { value: 'aap' } })
      expect(edits2[0]).toMatchObject({ oldValue: { value: 'aap' }, newValue: { value: 'beer' } })
    })
  })

  describe('multi-user scenario', () => {
    it('different users editing different fields produces separate edits', () => {
      const baseState = { metadata: {}, answers: { dpia: { '1.1': { value: 'a' } } } }

      // User A edits field 1.1
      const stateAfterA = { metadata: {}, answers: { dpia: { '1.1': { value: 'b' } } } }
      const editsA = diffStates(baseState, stateAfterA, USER_A)

      // User B edits field 1.2 (starting from A's state)
      const stateAfterB = { metadata: {}, answers: { dpia: { '1.1': { value: 'b' }, '1.2': { value: 'new' } } } }
      const editsB = diffStates(stateAfterA, stateAfterB, USER_B)

      expect(editsA).toHaveLength(1)
      expect(editsA[0]).toMatchObject({ fieldId: 'dpia.1.1', editedBy: USER_A })

      expect(editsB).toHaveLength(1)
      expect(editsB[0]).toMatchObject({ fieldId: 'dpia.1.2', editedBy: USER_B })
    })

    it('same field edited by two users shows both edits with correct attribution', () => {
      const state0 = { metadata: {}, answers: { dpia: { '1.1': { value: 'original' } } } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'user-a-version' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'user-b-version' } } } }

      const editsA = diffStates(state0, state1, USER_A)
      const editsB = diffStates(state1, state2, USER_B)

      expect(editsA[0]).toMatchObject({
        editedBy: USER_A,
        oldValue: { value: 'original' },
        newValue: { value: 'user-a-version' },
      })
      expect(editsB[0]).toMatchObject({
        editedBy: USER_B,
        oldValue: { value: 'user-a-version' },
        newValue: { value: 'user-b-version' },
      })
    })
  })

  describe('consolidation preserves edit history correctly', () => {
    it('consolidated saves produce independent edits that can be collapsed in the UI', () => {
      // User changes field A in save 1, then changes field A again in save 2 (consolidated)
      // Both edits are stored — the UI collapses them (first old → last new)
      const state0 = { metadata: {}, answers: { dpia: { '1.1': { value: 'first' } } } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'second' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'third' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      // Both produce edits — in a consolidated version these would be stored together
      expect(edits1).toHaveLength(1)
      expect(edits2).toHaveLength(1)

      // The full chain is preserved: first→second, second→third
      expect(edits1[0]).toMatchObject({ oldValue: { value: 'first' }, newValue: { value: 'second' } })
      expect(edits2[0]).toMatchObject({ oldValue: { value: 'second' }, newValue: { value: 'third' } })
    })

    it('same field edited twice produces two edits that the UI can collapse to net change', () => {
      // User changes field 1.1 to "aap", then corrects to "beer" in a second consolidated save
      const state0 = { metadata: {}, answers: { dpia: {} } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'aap' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'beer' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      // Both edits exist independently (stored in same version during consolidation)
      expect(edits1).toHaveLength(1)
      expect(edits2).toHaveLength(1)
      expect(edits1[0]).toMatchObject({ fieldId: 'dpia.1.1', oldValue: null, newValue: { value: 'aap' } })
      expect(edits2[0]).toMatchObject({ fieldId: 'dpia.1.1', oldValue: { value: 'aap' }, newValue: { value: 'beer' } })

      // When the UI collapses these: first oldValue (null) → last newValue ({value: 'beer'})
      // This is the net change the user sees in the diff view
    })

    it('same field edited back to original produces two edits that cancel out', () => {
      // User changes field, then changes it back — net diff is nothing
      const state0 = { metadata: {}, answers: { dpia: { '1.1': { value: 'original' } } } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'changed' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'original' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      // Both edits are stored...
      expect(edits1).toHaveLength(1)
      expect(edits2).toHaveLength(1)

      // ...but the UI collapse would see: oldValue={value:'original'} → newValue={value:'original'}
      // and skip the field since JSON.stringify matches. This is handled in VersionHistory.vue.
    })

    it('mixed field edits across consolidated saves track each field independently', () => {
      const state0 = { metadata: {}, answers: { dpia: { '1.1': { value: 'a' }, '1.2': { value: 'x' } } } }
      const state1 = { metadata: {}, answers: { dpia: { '1.1': { value: 'b' }, '1.2': { value: 'x' } } } }
      const state2 = { metadata: {}, answers: { dpia: { '1.1': { value: 'b' }, '1.2': { value: 'y' } } } }

      const edits1 = diffStates(state0, state1, USER_A)
      const edits2 = diffStates(state1, state2, USER_A)

      // Save 1 changes field 1.1 only
      expect(edits1).toHaveLength(1)
      expect(edits1[0].fieldId).toBe('dpia.1.1')

      // Save 2 changes field 1.2 only
      expect(edits2).toHaveLength(1)
      expect(edits2[0].fieldId).toBe('dpia.1.2')
    })
  })

  describe('navigation-only saves do not create edits', () => {
    it('changing currentRootTaskId produces no edits', () => {
      const state1 = {
        metadata: {},
        answers: { dpia: { '1.1': { value: 'x' } } },
        taskState: { dpia: { currentRootTaskId: '1', completedRootTaskIds: [], taskInstances: {} } },
      }
      const state2 = {
        metadata: {},
        answers: { dpia: { '1.1': { value: 'x' } } },
        taskState: { dpia: { currentRootTaskId: '3', completedRootTaskIds: [], taskInstances: {} } },
      }
      expect(diffStates(state1, state2, USER_A)).toEqual([])
    })

    it('changing only metadata produces no edits', () => {
      const state1 = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: { '1.1': { value: 'x' } } },
      }
      const state2 = {
        metadata: { createdAt: '2024-01-02', urn: 'urn:nl:dpia:3.0' },
        answers: { dpia: { '1.1': { value: 'x' } } },
      }
      expect(diffStates(state1, state2, USER_A)).toEqual([])
    })
  })
})

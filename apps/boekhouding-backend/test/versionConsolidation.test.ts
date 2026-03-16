import { describe, it, expect } from 'vitest'
import { diffStates } from '../src/utils/diffStates.js'

const USER_A = 'user-a'
const USER_B = 'user-b'

describe('version consolidation logic', () => {
  // These tests verify the decision logic that the PUT route uses.
  // The route consolidates (updates in-place) when:
  //   1. Same user as current version's savedBy
  //   2. No forceNewVersion flag
  //   3. No changeDescription (like a restore)
  // Otherwise it creates a new version.

  describe('consolidation decision', () => {
    // Simulating the decision logic from the route
    function shouldConsolidate(
      currentVersionSavedBy: string,
      requestUserId: string,
      forceNewVersion: boolean,
      changeDescription?: string,
    ): boolean {
      const sameUser = currentVersionSavedBy === requestUserId
      return sameUser && !forceNewVersion && !changeDescription
    }

    it('consolidates when same user, no flags', () => {
      expect(shouldConsolidate(USER_A, USER_A, false)).toBe(true)
    })

    it('does not consolidate when different user', () => {
      expect(shouldConsolidate(USER_A, USER_B, false)).toBe(false)
    })

    it('does not consolidate when forceNewVersion is true', () => {
      expect(shouldConsolidate(USER_A, USER_A, true)).toBe(false)
    })

    it('does not consolidate when changeDescription is set (e.g. restore)', () => {
      expect(shouldConsolidate(USER_A, USER_A, false, 'Hersteld naar versie 3')).toBe(false)
    })

    it('does not consolidate when different user even with no flags', () => {
      expect(shouldConsolidate(USER_B, USER_A, false, undefined)).toBe(false)
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

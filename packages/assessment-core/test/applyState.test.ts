import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { applyStateToStores } from '../src/utils/applyState'
import type { AssessmentState } from '../src/models/assessmentState'

describe('applyStateToStores', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  describe('answers', () => {
    it('applies namespaced answers to the answer store', () => {
      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          prescan: {
            '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.prescan['1.1.1']).toEqual({ value: 'false', lastEditedAt: '2024-01-01' })
    })

    it('does not overwrite answers with empty namespace', () => {
      answerStore.answers.dpia = { '1.1': { value: 'existing', lastEditedAt: '2024-01-01' } }

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: {} },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['1.1']).toEqual({ value: 'existing', lastEditedAt: '2024-01-01' })
    })
  })

  describe('taskInstances', () => {
    it('applies task instances when present', () => {
      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
        taskState: {
          prescan: {
            currentRootTaskId: '2',
            completedRootTaskIds: ['0', '1'],
            taskInstances: {
              '0': { id: '0', taskId: '0', parentInstanceId: null, childInstanceIds: ['0.1'], groupId: 'g0' },
            },
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.taskInstances.prescan['0']).toBeDefined()
      expect(taskStore.currentRootTaskId.prescan).toBe('2')
    })

    it('does not overwrite task instances when empty in state', () => {
      taskStore.taskInstances.prescan = {
        '0': { id: '0', taskId: '0', parentInstanceId: null, childInstanceIds: [], groupId: 'g0' },
      }

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
        taskState: {
          prescan: {
            currentRootTaskId: '0',
            completedRootTaskIds: ['0', '1'],
            taskInstances: {},
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      // Existing task instances should NOT be wiped
      expect(taskStore.taskInstances.prescan['0']).toBeDefined()
    })
  })

  describe('completedRootTaskIds', () => {
    it('applies completedRootTaskIds when taskInstances are present', () => {
      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
        taskState: {
          prescan: {
            currentRootTaskId: '0',
            completedRootTaskIds: ['0', '1', '3', '5', '7'],
            taskInstances: {
              '0': { id: '0', taskId: '0', parentInstanceId: null, childInstanceIds: [], groupId: 'g0' },
            },
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3', '5', '7']))
    })

    it('applies completedRootTaskIds even when taskInstances is empty', () => {
      // This is the key scenario: AssessmentOutput import produces
      // completedRootTaskIds derived from answers, but empty taskInstances
      // (which are rebuilt later by syncInstances).
      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: {
          prescan: { '0.1': { value: 'true', lastEditedAt: '2024-01-01' } },
        },
        taskState: {
          prescan: {
            currentRootTaskId: '0',
            completedRootTaskIds: ['0', '1', '3', '5', '7'],
            taskInstances: {},
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3', '5', '7']))
    })

    it('does not clear completedRootTaskIds when state has empty array', () => {
      taskStore.completedRootTaskIds.dpia = new Set(['0', '1'])

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
        taskState: {
          dpia: {
            currentRootTaskId: '0',
            completedRootTaskIds: [],
            taskInstances: {},
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      // Empty array should NOT overwrite existing completed state
      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set(['0', '1']))
    })
  })

  describe('full import pipeline: AssessmentOutput → normalize → apply', () => {
    it('prescan export with flat answers ends up with correct store state', async () => {
      // Simulate what happens when a user imports a prescan JSON export
      const { detectImportType, normalizeToState } = await import('../src/utils/importDetect')

      const exportedJson = {
        $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
        metadata: { createdAt: '2026-03-19T22:05:10.062Z', urn: 'urn:nl:prescan:2.0' },
        answers: {
          '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
          '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' },
          '1.1.1': { value: 'true', timestamp: '2026-02-10T22:01:42.541Z' },
          '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
          '5.1.1': { value: 'false', timestamp: '2026-02-10T22:05:06.564Z' },
        },
      }

      const type = detectImportType(exportedJson)
      const state = normalizeToState(exportedJson, type!)
      applyStateToStores(state, taskStore, answerStore)

      // Answers stored under prescan namespace
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })

      // Sections with answers are marked as completed
      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3', '5']))

      // Task instances remain empty (rebuilt later by syncInstances)
      expect(Object.keys(taskStore.taskInstances.prescan)).toHaveLength(0)
    })
  })

  describe('setAnswer after import preserves existing answers', () => {
    it('changing one answer does not clear other answers in the same namespace', () => {
      // This is the exact bug scenario: after import, the user changes one answer
      // and all other answers in that section disappear.
      answerStore.setActiveNamespace('prescan' as any)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: {
          prescan: {
            '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '0.2': { value: 'beschrijving', lastEditedAt: '2024-01-01' },
            '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
            '1.2.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '3.1': { value: [], lastEditedAt: '2024-01-01' },
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      // Verify all answers were applied
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)

      // Now simulate user changing ONE answer
      answerStore.setAnswer('1.1.1', 'true')

      // ALL other answers must still be present
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.prescan['0.2']).toEqual({ value: 'beschrijving', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.prescan['1.2.1']).toEqual({ value: 'true', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.prescan['3.1']).toEqual({ value: [], lastEditedAt: '2024-01-01' })
      // Changed answer has new value and timestamp
      expect(answerStore.answers.prescan['1.1.1'].value).toBe('true')
    })

    it('JSON.stringify of answers after setAnswer includes all answers', () => {
      // This tests the serialization path used by buildState() → API call
      answerStore.setActiveNamespace('prescan' as any)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: {
          prescan: {
            '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '0.2': { value: 'beschrijving', lastEditedAt: '2024-01-01' },
            '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)
      answerStore.setAnswer('1.1.1', 'true')

      // Simulate what buildState does: reference the reactive proxy, then serialize
      const builtState = {
        answers: { prescan: answerStore.answers.prescan },
      }
      const serialized = JSON.parse(JSON.stringify(builtState))

      expect(Object.keys(serialized.answers.prescan)).toHaveLength(3)
      expect(serialized.answers.prescan['0.1'].value).toBe('true')
      expect(serialized.answers.prescan['0.2'].value).toBe('beschrijving')
      expect(serialized.answers.prescan['1.1.1'].value).toBe('true')
    })

    it('imported answers with timestamp field survive setAnswer', () => {
      // AssessmentOutput exports use "timestamp" not "lastEditedAt" —
      // verify these non-standard answer objects survive setAnswer()
      answerStore.setActiveNamespace('prescan' as any)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: {
          prescan: {
            '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' } as any,
            '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' } as any,
          },
        },
      }

      applyStateToStores(state, taskStore, answerStore)
      answerStore.setAnswer('0.1', 'false')

      // The OTHER answer (0.2) must still be present with its original format
      expect(answerStore.answers.prescan['0.2']).toEqual({ value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' })
      // Changed answer has new format
      expect(answerStore.answers.prescan['0.1'].value).toBe('false')
      expect(answerStore.answers.prescan['0.1'].lastEditedAt).toBeDefined()
    })

    it('answers survive applyStateToStores being called twice (conflict auto-merge)', () => {
      // In the conflict resolution flow, applyStateToStores is called with
      // the server state, then pending changes are replayed on top.
      answerStore.setActiveNamespace('prescan' as any)

      const initialState: AssessmentState = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: {
          prescan: {
            '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '0.2': { value: 'beschrijving', lastEditedAt: '2024-01-01' },
          },
        },
      }
      applyStateToStores(initialState, taskStore, answerStore)

      // User changes one answer
      answerStore.setAnswer('0.1', 'false')

      // Conflict: server state is applied again
      const serverState: AssessmentState = {
        metadata: { createdAt: '2024-01-02', activeNamespace: 'prescan' },
        answers: {
          prescan: {
            '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
            '0.2': { value: 'updated description', lastEditedAt: '2024-01-02' },
          },
        },
      }
      applyStateToStores(serverState, taskStore, answerStore)

      // Server answers should be applied
      expect(answerStore.answers.prescan['0.1'].value).toBe('true')
      expect(answerStore.answers.prescan['0.2'].value).toBe('updated description')

      // Replay pending change
      answerStore.setAnswer('0.1', 'false')

      // Both answers present
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(2)
      expect(answerStore.answers.prescan['0.1'].value).toBe('false')
      expect(answerStore.answers.prescan['0.2'].value).toBe('updated description')
    })
  })

  describe('post-initialization baseline (snapshotBaseline scenario)', () => {
    it('answers survive syncInstances adding task instances', async () => {
      // Simulate the full Form.vue initialization flow:
      // 1. loadAppState → returns imported state
      // 2. applyAppState → puts answers + completedRootTaskIds in stores
      // 3. syncInstances → adds task instances (modifies taskStore)
      // 4. snapshotBaseline → captures buildState() as baseline
      //
      // The bug was: lastSavedState was set at step 1 (API response with
      // empty taskInstances), so the diff at step 4 saw new instances as changes.

      const { detectImportType, normalizeToState } = await import('../src/utils/importDetect')

      const exportedJson = {
        $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
        metadata: { createdAt: '2026-03-19T22:05:10.062Z', urn: 'urn:nl:prescan:2.0', completedTasks: ['0'] },
        answers: {
          '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
          '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' },
        },
      }

      // Step 1-2: normalize and apply
      const type = detectImportType(exportedJson)
      const state = normalizeToState(exportedJson, type!)
      applyStateToStores(state, taskStore, answerStore)

      // Step 3: simulate syncInstances adding task instances
      taskStore.taskInstances.prescan = {
        '0': { id: '0', taskId: '0', parentInstanceId: null, childInstanceIds: ['0.1', '0.2'], groupId: 'g0' },
        '0.1': { id: '0.1', taskId: '0.1', parentInstanceId: '0', childInstanceIds: [], groupId: 'g0' },
        '0.2': { id: '0.2', taskId: '0.2', parentInstanceId: '0', childInstanceIds: [], groupId: 'g0' },
      }

      // After initialization, answers must still be intact
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(2)
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })
      expect(answerStore.answers.prescan['0.2']).toEqual({ value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' })

      // completedRootTaskIds must still be intact
      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0']))

      // Task instances now exist (from syncInstances)
      expect(Object.keys(taskStore.taskInstances.prescan)).toHaveLength(3)
    })

    it('baseline after init matches current state — no phantom diffs', async () => {
      // This test verifies the fix for the "phantom changes" bug:
      // After import, the baseline (snapshotBaseline) should match buildState(),
      // so toggling completion only produces that one change, not all answers.

      const { detectImportType, normalizeToState } = await import('../src/utils/importDetect')

      const exportedJson = {
        $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
        metadata: { createdAt: '2026-03-19T22:05:10.062Z', urn: 'urn:nl:prescan:2.0', completedTasks: ['0'] },
        answers: {
          '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
        },
      }

      // Initialize: normalize → apply → simulate syncInstances
      const type = detectImportType(exportedJson)
      const state = normalizeToState(exportedJson, type!)
      taskStore.setActiveNamespace('prescan' as any)
      applyStateToStores(state, taskStore, answerStore)
      taskStore.taskInstances.prescan = {
        '0': { id: '0', taskId: '0', parentInstanceId: null, childInstanceIds: ['0.1'], groupId: 'g0' },
        '0.1': { id: '0.1', taskId: '0.1', parentInstanceId: '0', childInstanceIds: [], groupId: 'g0' },
      }

      // Snapshot baseline (simulates what snapshotBaseline/buildState does after init)
      const baseline = {
        answers: { prescan: { ...answerStore.answers.prescan } },
        taskState: {
          prescan: {
            completedRootTaskIds: Array.from(taskStore.completedRootTaskIds.prescan),
            taskInstances: { ...taskStore.taskInstances.prescan },
          },
        },
      }

      // Answers in baseline must match the imported answers exactly
      expect(baseline.answers.prescan['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })

      // completedRootTaskIds in baseline must match the imported sections
      expect(baseline.taskState.prescan.completedRootTaskIds).toEqual(['0'])

      // taskInstances in baseline must include the syncInstances-created instances
      expect(Object.keys(baseline.taskState.prescan.taskInstances)).toHaveLength(2)

      // Now simulate user toggling completion and verify only that changes
      taskStore.completedRootTaskIds.prescan = new Set()
      const afterChange = Array.from(taskStore.completedRootTaskIds.prescan)

      // Answers unchanged
      expect(answerStore.answers.prescan['0.1']).toEqual(baseline.answers.prescan['0.1'])
      // Only completedRootTaskIds changed
      expect(afterChange).not.toEqual(baseline.taskState.prescan.completedRootTaskIds)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { migrateStateV1toV2 } from '../src/utils/stateMigration'
import { OUTPUT_SCHEMA_URL, type AssessmentState } from '../src/models/assessmentState'

const urnLookup: Record<string, string> = {
  dpia: 'urn:nl:dpia:3.0',
  prescan: 'urn:nl:prescan:3.0',
}

describe('migrateStateV1toV2', () => {
  describe('guard: empty or minimal states', () => {
    it('returns state unchanged if metadata is missing', () => {
      const state = {} as AssessmentState
      const result = migrateStateV1toV2(state, urnLookup)
      expect(result).toBe(state)
    })
  })

  describe('v1 detection (nanoid-based keys)', () => {
    it('detects v1 from answer keys containing underscore + random suffix', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          dpia: {
            '1.1_xK9mQ7p': { value: 'test' },
            '1.2_aB3cD4e': { value: 'other' },
          },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_xK9mQ7p': { id: '1.1_xK9mQ7p', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
              '1.2_aB3cD4e': { id: '1.2_aB3cD4e', taskId: '1.2', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      expect(result).not.toBe(v1State)
      expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    })

    it('does NOT treat completed.* keys as v1 (they naturally contain dots, not underscores)', () => {
      const v2State: AssessmentState = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: {
          'completed.1': { value: 'true' },
          '1.1': { value: 'test' },
        },
      }

      const result = migrateStateV1toV2(v2State, urnLookup)
      // Should NOT be detected as v1 — $schema is present
      expect(result).toBe(v2State)
    })
  })

  describe('v1 → v2 key migration', () => {
    it('rewrites nanoid answer keys to plain taskId for non-repeatable tasks', () => {
      const v1State = {
        metadata: { createdAt: '2024-06-01', activeNamespace: 'dpia' },
        answers: {
          dpia: {
            '1.1_abc1234': { value: 'Inleiding' },
            '1.2_def5678': { value: 'Doel' },
          },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: ['0'],
            taskInstances: {
              '1.1_abc1234': { id: '1.1_abc1234', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
              '1.2_def5678': { id: '1.2_def5678', taskId: '1.2', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)

      // Answer keys should be plain taskIds (no nanoid suffix)
      expect(result.answers).toHaveProperty('dpia')
      const dpiaAnswers = (result.answers as any).dpia
      expect(dpiaAnswers['1.1']).toEqual({ value: 'Inleiding' })
      expect(dpiaAnswers['1.2']).toEqual({ value: 'Doel' })
      // Old keys should not exist
      expect(dpiaAnswers).not.toHaveProperty('1.1_abc1234')
      expect(dpiaAnswers).not.toHaveProperty('1.2_def5678')
    })

    it('assigns bracket indices for repeatable tasks (multiple instances per taskId)', () => {
      const v1State = {
        metadata: { createdAt: '2024-06-01', activeNamespace: 'dpia' },
        answers: {
          dpia: {
            '2.1_aaa1111': { value: 'E-mailadres' },
            '2.1_bbb2222': { value: 'Telefoon' },
            '2.1_ccc3333': { value: 'Adres' },
          },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '2.1_aaa1111': { id: '2.1_aaa1111', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
              '2.1_bbb2222': { id: '2.1_bbb2222', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
              '2.1_ccc3333': { id: '2.1_ccc3333', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      const dpiaAnswers = (result.answers as any).dpia

      // Three instances of 2.1 → 2.1[0], 2.1[1], 2.1[2]
      expect(dpiaAnswers['2.1[0]']).toEqual({ value: 'E-mailadres' })
      expect(dpiaAnswers['2.1[1]']).toEqual({ value: 'Telefoon' })
      expect(dpiaAnswers['2.1[2]']).toEqual({ value: 'Adres' })
    })

    it('sets $schema on migrated output', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1_xyz': { value: 'x' } } },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_xyz': { id: '1.1_xyz', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    })

    it('resolves URN from urnLookup based on activeNamespace', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'prescan' },
        answers: { prescan: { '1.1_xyz': { value: 'x' } } },
        taskState: {
          prescan: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_xyz': { id: '1.1_xyz', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      expect(result.metadata.urn).toBe('urn:nl:prescan:3.0')
    })

    it('defaults to dpia namespace when activeNamespace is missing', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01' },
        answers: { dpia: { '1.1_xyz': { value: 'x' } } },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_xyz': { id: '1.1_xyz', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
    })

    it('preserves completedRootTaskIds', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1_xyz': { value: 'x' } } },
        taskState: {
          dpia: {
            completedRootTaskIds: ['0', '1', '2'],
            taskInstances: {
              '1.1_xyz': { id: '1.1_xyz', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      const dpiaTaskState = (result as any).taskState?.dpia
      expect(dpiaTaskState.completedRootTaskIds).toEqual(['0', '1', '2'])
    })

    it('strips taskInstances from migrated output', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: { dpia: { '1.1_xyz': { value: 'x' } } },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_xyz': { id: '1.1_xyz', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      const dpiaTaskState = (result as any).taskState?.dpia
      expect(dpiaTaskState).not.toHaveProperty('taskInstances')
      expect(dpiaTaskState).not.toHaveProperty('currentRootTaskId')
    })
  })

  describe('v2 state with legacy fields (stripLegacyFields)', () => {
    it('strips taskInstances and currentRootTaskId from already-v2 state', () => {
      const v2WithLegacy = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'test' } },
        taskState: {
          dpia: {
            completedRootTaskIds: ['0'],
            currentRootTaskId: '1',
            taskInstances: { '1.1': { id: '1.1', taskId: '1.1' } },
          },
        },
      } as any

      const result = migrateStateV1toV2(v2WithLegacy, urnLookup)
      const dpiaTaskState = (result as any).taskState?.dpia
      expect(dpiaTaskState.completedRootTaskIds).toEqual(['0'])
      expect(dpiaTaskState).not.toHaveProperty('taskInstances')
      expect(dpiaTaskState).not.toHaveProperty('currentRootTaskId')
    })

    it('strips activeNamespace from metadata', () => {
      const v2WithLegacy = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: '2024-01-01',
          urn: 'urn:nl:dpia:3.0',
          activeNamespace: 'dpia',
        },
        answers: { '1.1': { value: 'test' } },
      } as any

      const result = migrateStateV1toV2(v2WithLegacy, urnLookup)
      expect((result.metadata as any).activeNamespace).toBeUndefined()
      expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
    })

    it('resolves urn from urnLookup if missing but activeNamespace is present', () => {
      const v2WithLegacy = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: '2024-01-01',
          activeNamespace: 'prescan',
        },
        answers: { '1.1': { value: 'test' } },
      } as any

      const result = migrateStateV1toV2(v2WithLegacy, urnLookup)
      expect(result.metadata.urn).toBe('urn:nl:prescan:3.0')
    })

    it('preserves answers unchanged for v2 state', () => {
      const answers = {
        '1.1': { value: 'test' },
        '2.1': [
          { _index: 0, '2.1.1': { value: 'E-mail' } },
          { _index: 2, '2.1.1': { value: 'Telefoon' } },
        ],
      }
      const v2WithLegacy = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: '2024-01-01',
          urn: 'urn:nl:dpia:3.0',
          activeNamespace: 'dpia',
        },
        answers,
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            currentRootTaskId: '0',
          },
        },
      } as any

      const result = migrateStateV1toV2(v2WithLegacy, urnLookup)
      expect(result.answers).toBe(answers)
    })
  })

  describe('edge cases', () => {
    it('answer key without matching taskInstance keeps original key', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: {
          dpia: {
            '1.1_abc': { value: 'mapped' },
            'orphan_key': { value: 'unmapped' },
          },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_abc': { id: '1.1_abc', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      const dpiaAnswers = (result.answers as any).dpia
      expect(dpiaAnswers['1.1']).toEqual({ value: 'mapped' })
      // Orphan key falls through with ?? oldKey
      expect(dpiaAnswers['orphan_key']).toEqual({ value: 'unmapped' })
    })

    it('handles multiple namespaces in a single v1 state', () => {
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: {
          dpia: { '1.1_aaa': { value: 'dpia-answer' } },
          prescan: { '1.1_bbb': { value: 'prescan-answer' } },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: ['0'],
            taskInstances: {
              '1.1_aaa': { id: '1.1_aaa', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
          prescan: {
            completedRootTaskIds: [],
            taskInstances: {
              '1.1_bbb': { id: '1.1_bbb', taskId: '1.1', groupId: '1', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      expect((result.answers as any).dpia['1.1']).toEqual({ value: 'dpia-answer' })
      expect((result.answers as any).prescan['1.1']).toEqual({ value: 'prescan-answer' })
      expect((result as any).taskState.dpia.completedRootTaskIds).toEqual(['0'])
      expect((result as any).taskState.prescan.completedRootTaskIds).toEqual([])
    })

    it('assigns bracket indices in sorted key order', () => {
      // Keys are sorted lexicographically: 2.1_aaa < 2.1_mmm < 2.1_zzz
      const v1State = {
        metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
        answers: {
          dpia: {
            '2.1_zzz': { value: 'third' },
            '2.1_aaa': { value: 'first' },
            '2.1_mmm': { value: 'second' },
          },
        },
        taskState: {
          dpia: {
            completedRootTaskIds: [],
            taskInstances: {
              '2.1_zzz': { id: '2.1_zzz', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
              '2.1_aaa': { id: '2.1_aaa', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
              '2.1_mmm': { id: '2.1_mmm', taskId: '2.1', groupId: '2', parentInstanceId: null, childInstanceIds: [] },
            },
          },
        },
      } as any

      const result = migrateStateV1toV2(v1State, urnLookup)
      const dpiaAnswers = (result.answers as any).dpia
      // Sorted: aaa → [0], mmm → [1], zzz → [2]
      expect(dpiaAnswers['2.1[0]']).toEqual({ value: 'first' })
      expect(dpiaAnswers['2.1[1]']).toEqual({ value: 'second' })
      expect(dpiaAnswers['2.1[2]']).toEqual({ value: 'third' })
    })
  })

  describe('clean v2 state (no-op)', () => {
    it('returns same reference if state is already clean v2', () => {
      const cleanV2: AssessmentState = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: { createdAt: '2024-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'test' } },
      }

      const result = migrateStateV1toV2(cleanV2, urnLookup)
      expect(result).toBe(cleanV2)
    })

    it('returns same reference for v2 state with completedTasks but no legacy fields', () => {
      const cleanV2: AssessmentState = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: '2024-01-01',
          urn: 'urn:nl:dpia:3.0',
          completedTasks: ['0', '1'],
        },
        answers: { '1.1': { value: 'test' } },
      }

      const result = migrateStateV1toV2(cleanV2, urnLookup)
      expect(result).toBe(cleanV2)
    })
  })
})

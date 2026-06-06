import { describe, it, expect } from 'vitest'
import { migrateStateV1toV2 } from '../../src/utils/stateMigration'
import { OUTPUT_SCHEMA_URL, type AssessmentState } from '../../src/models/assessmentState'

const urnLookup = {
  dpia: 'urn:nl:dpia:3.0',
  prescan: 'urn:nl:prescan:2.0',
}

function answer(value: string) {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('migrateStateV1toV2 — guards', () => {
  it('returns the same reference when metadata is missing (incomplete state)', () => {
    const state = { answers: {} } as unknown as AssessmentState
    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })
})

describe('migrateStateV1toV2 — v1 detection paths', () => {
  it('treats a state with $schema as already-v2 (isV1State returns false on $schema)', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      answers: {
        dpia: { '2.1.3_xK9mQ7p': answer('looks v1 but ignored') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })

  it('detects v1 via nanoid answer key (key contains "_" and not completed.)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          currentRootTaskId: '0',
          completedRootTaskIds: ['0', '1'],
          taskInstances: {
            'inst_a': { id: 'inst_a', taskId: '2.1.3', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 'inst_a': answer('Email') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(result.answers.dpia['2.1.3']).toEqual(answer('Email'))
  })

  it('does NOT treat a "completed." prefixed key with underscore as v1', () => {
    const state = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      answers: {
        dpia: { 'completed.section_1': answer('done') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })

  it('detects v1 via taskInstance key containing "_" even when answers are clean', () => {
    const state = {
      metadata: { createdAt: '2026-01-01' },
      taskState: {
        dpia: {
          completedRootTaskIds: [],
          taskInstances: {
            'inst_x': { id: 'inst_x', taskId: '3.2', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { '1.1': answer('clean key') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(result.answers.dpia['1.1']).toEqual(answer('clean key'))
  })

  it('not v1 when taskInstance keys have no underscore (covers isV1State false fall-through)', () => {
    const state = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['0'],
          taskInstances: {
            'clean': { id: 'clean', taskId: '3.2', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { '1.1': answer('clean key') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.taskState.dpia.taskInstances).toBeUndefined()
    expect(result.taskState.dpia.completedRootTaskIds).toEqual(['0'])
  })

  it('handles nsState without taskInstances in legacy taskState (covers !nsState?.taskInstances continue)', () => {
    const state = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      taskState: {
        dpia: { completedRootTaskIds: ['0'] },
        prescan: undefined,
      },
      answers: {
        dpia: { '1.1': answer('clean key') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result).toBe(state)
  })

  it('handles missing answers object entirely (answers || {} branch)', () => {
    const state = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })

  it('handles answers namespace that is undefined (covers !answers continue in isV1State)', () => {
    const state = {
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      answers: {
        dpia: undefined,
        prescan: { '1.1': answer('clean') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })
})

describe('migrateV1Keys — repeatable detection and key rewriting', () => {
  it('assigns indexed keys for repeatable taskIds and bare keys for single instances', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          currentRootTaskId: '2',
          completedRootTaskIds: ['2'],
          taskInstances: {
            'a_aa': { id: 'a_aa', taskId: '2.1.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
            'b_bb': { id: 'b_bb', taskId: '2.1.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
            'c_cc': { id: 'c_cc', taskId: '3.1', groupId: 'g2', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: {
          'a_aa': answer('Email'),
          'b_bb': answer('Phone'),
          'c_cc': answer('Single'),
          '0.1': answer('Project name'),
        },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any

    expect(result.answers.dpia['2.1.1[0]']).toEqual(answer('Email'))
    expect(result.answers.dpia['2.1.1[1]']).toEqual(answer('Phone'))
    expect(result.answers.dpia['3.1']).toEqual(answer('Single'))
    expect(result.answers.dpia['0.1']).toEqual(answer('Project name'))

    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['2'] })
    expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(result.metadata.createdAt).toBe('2026-01-01')
    expect(result.metadata.activeNamespace).toBeUndefined()
  })

  it('falls back to "dpia" namespace when activeNamespace is absent (|| dpia branch)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01' },
      taskState: {
        dpia: {
          completedRootTaskIds: [],
          taskInstances: {
            'z_z': { id: 'z_z', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 'z_z': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
  })

  it('falls back to state.metadata.urn when urnLookup has no entry for the namespace', () => {
    const state = {
      metadata: { urn: 'urn:fallback:1.0', createdAt: '2026-01-01', activeNamespace: 'unknownNs' },
      taskState: {
        dpia: {
          completedRootTaskIds: [],
          taskInstances: {
            'q_q': { id: 'q_q', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 'q_q': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.metadata.urn).toBe('urn:fallback:1.0')
  })

  it('skips undefined namespaces in legacy taskState (covers !taskState continue)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['0'],
          taskInstances: {
            'r_r': { id: 'r_r', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
        prescan: undefined,
      },
      answers: {
        dpia: { 'r_r': answer('detect v1') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['0'] })
    expect(result.taskState.prescan).toBeUndefined()
  })

  it('handles namespace with no answers (covers !oldAnswers branch)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['0'],
          taskInstances: {
            's_s': { id: 's_s', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
        prescan: {
          completedRootTaskIds: [],
          taskInstances: {
            't_t': { id: 't_t', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 's_s': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.answers.dpia['1.1']).toEqual(answer('val'))
    expect(result.taskState.prescan).toEqual({ completedRootTaskIds: [] })
    expect(result.answers.prescan).toBeUndefined()
  })

  it('defaults completedRootTaskIds to [] when absent (|| [] branch)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          taskInstances: {
            'u_u': { id: 'u_u', taskId: '1.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 'u_u': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: [] })
  })

  it('handles empty taskInstances object (taskInstances || {} branch with first-pass count 0)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['0'],
          taskInstances: {},
        },
      },
      answers: {
        dpia: { 'v_v': answer('passes through unmapped') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.answers.dpia['v_v']).toEqual(answer('passes through unmapped'))
  })

  it('handles v1 state with no taskState property (taskState ?? {} branch in migrateV1Keys)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      answers: {
        dpia: { 'orphan_key': answer('no mapping') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(result.answers).toEqual({})
    expect(result.taskState).toEqual({})
    expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
  })

  it('handles v1 namespace whose taskState has no taskInstances (taskInstances || {} branch)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: { completedRootTaskIds: ['0'] },
      },
      answers: {
        dpia: { 'w_w': answer('unmapped passthrough') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.answers.dpia['w_w']).toEqual(answer('unmapped passthrough'))
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['0'] })
  })

  it('defaults taskIdCounters.get to 0 and assignedCounters.get to 0 (|| 0 branches)', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: {
          completedRootTaskIds: [],
          taskInstances: {
            'i1': { id: 'i1', taskId: '4.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
            'i2': { id: 'i2', taskId: '4.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
            'i3': { id: 'i3', taskId: '4.1', groupId: 'g2', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { 'i1': answer('E-mailadres'), 'i2': answer('Telefoonnummer'), 'i3': answer('BSN'), 'x_x': answer('detect') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.answers.dpia['4.1[0]']).toEqual(answer('E-mailadres'))
    expect(result.answers.dpia['4.1[1]']).toEqual(answer('Telefoonnummer'))
    expect(result.answers.dpia['4.1[2]']).toEqual(answer('BSN'))
  })
})

describe('stripLegacyFields — already-v2 cleanup', () => {
  it('returns same reference when there are no legacy fields', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      taskState: {
        dpia: { completedRootTaskIds: ['0'] },
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup)
    expect(result).toBe(state)
  })

  it('strips activeNamespace from metadata', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: { completedRootTaskIds: ['0', '1'] },
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result).not.toBe(state)
    expect(result.metadata.activeNamespace).toBeUndefined()
    expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(result.metadata.createdAt).toBe('2026-01-01')
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['0', '1'] })
    expect(result.answers.dpia['1.1']).toEqual(answer('val'))
  })

  it('strips currentRootTaskId from taskState (covers ts?.currentRootTaskId in some())', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      taskState: {
        dpia: { currentRootTaskId: '2', completedRootTaskIds: ['0'] },
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result).not.toBe(state)
    expect(result.taskState.dpia.currentRootTaskId).toBeUndefined()
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['0'] })
  })

  it('strips taskInstances from taskState (covers ts?.taskInstances in some())', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01' },
      taskState: {
        dpia: {
          completedRootTaskIds: ['0'],
          taskInstances: {
            'clean': { id: 'clean', taskId: '2.1', groupId: 'g', parentInstanceId: null, childInstanceIds: [] },
          },
        },
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.taskState.dpia.taskInstances).toBeUndefined()
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: ['0'] })
  })

  it('derives urn from urnLookup when metadata.urn is absent (urn || lookup branch)', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { createdAt: '2026-01-01', activeNamespace: 'prescan' },
      taskState: {
        prescan: { completedRootTaskIds: [] },
      },
      answers: {
        prescan: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.metadata.urn).toBe('urn:nl:prescan:2.0')
  })

  it('falls back to "dpia" in lookup when urn and activeNamespace are both absent', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { createdAt: '2026-01-01' },
      taskState: {
        dpia: { currentRootTaskId: '0', completedRootTaskIds: [] },
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.metadata.urn).toBe('urn:nl:dpia:3.0')
  })

  it('skips undefined namespace entries and defaults completedRootTaskIds to [] in cleanup', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01', activeNamespace: 'dpia' },
      taskState: {
        dpia: { currentRootTaskId: '0' },
        prescan: undefined,
      },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.taskState.dpia).toEqual({ completedRootTaskIds: [] })
    expect(result.taskState.prescan).toBeUndefined()
  })

  it('handles already-v2 state with no taskState at all (taskState ?? {} branch)', () => {
    const state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01', activeNamespace: 'dpia' },
      answers: {
        dpia: { '1.1': answer('val') },
      },
    } as unknown as AssessmentState

    const result = migrateStateV1toV2(state, urnLookup) as any
    expect(result.metadata.activeNamespace).toBeUndefined()
    expect(result.taskState).toEqual({})
    expect(result.answers.dpia['1.1']).toEqual(answer('val'))
  })
})

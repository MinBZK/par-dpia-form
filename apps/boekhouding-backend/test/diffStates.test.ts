import { describe, it, expect } from 'vitest'
import { diffStates, parseInstanceId, buildFieldUrn } from '../src/utils/diffStates.js'

const USER_ID = '00000000-0000-0000-0000-000000000002'

describe('parseInstanceId', () => {
  it('parses a plain task id', () => {
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
  })

  it('parses a task id with index', () => {
    expect(parseInstanceId('2.1.3[0]')).toEqual({ taskId: '2.1.3', index: 0 })
  })

  it('parses a task id with higher index', () => {
    expect(parseInstanceId('2.1.3[12]')).toEqual({ taskId: '2.1.3', index: 12 })
  })
})

describe('buildFieldUrn', () => {
  it('builds URN without index', () => {
    expect(buildFieldUrn('urn:nl:dpia:3.0', '2.1.3')).toBe('urn:nl:dpia:3.0?=task_id=2.1.3')
  })

  it('builds URN with index', () => {
    expect(buildFieldUrn('urn:nl:dpia:3.0', '2.1.3[0]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0')
  })
})

describe('diffStates', () => {
  it('returns empty array for identical states', () => {
    const state = {
      metadata: { createdAt: '2024-01-01' },
      answers: { dpia: { '2.1': { value: 'yes', timestamp: '2024-01-01' } } },
      taskState: { dpia: { completedRootTaskIds: ['1'], taskInstances: {} } },
    }
    const edits = diffStates(state, state, USER_ID)
    expect(edits).toEqual([])
  })

  it('detects answer changes with editType answer_change', () => {
    const oldState = {
      metadata: {},
      answers: { dpia: { '2.1': { value: 'yes' } } },
    }
    const newState = {
      metadata: {},
      answers: { dpia: { '2.1': { value: 'no' } } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      fieldId: 'dpia.2.1',
      oldValue: { value: 'yes' },
      newValue: { value: 'no' },
    })
  })

  it('detects new answers (field added)', () => {
    const oldState = { metadata: {}, answers: { dpia: {} } }
    const newState = { metadata: {}, answers: { dpia: { '2.1': { value: 'yes' } } } }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      oldValue: null,
      newValue: { value: 'yes' },
    })
  })

  it('detects removed answers (field deleted)', () => {
    const oldState = { metadata: {}, answers: { dpia: { '2.1': { value: 'yes' } } } }
    const newState = { metadata: {}, answers: { dpia: {} } }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'answer_change',
      oldValue: { value: 'yes' },
      newValue: null,
    })
  })

  it('detects section complete with editType section_complete', () => {
    const oldState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: {} } },
    }
    const newState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: ['1'], taskInstances: {} } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'section_complete',
      fieldId: 'dpia.completed.1',
      oldValue: false,
      newValue: true,
    })
  })

  it('detects section uncomplete', () => {
    const oldState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: ['1'], taskInstances: {} } },
    }
    const newState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: {} } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'section_complete',
      oldValue: true,
      newValue: false,
    })
  })

  it('detects task instance add', () => {
    const instance = { id: '2.1.3[1]', taskId: '2.1.3', groupId: null, parentInstanceId: null, childInstanceIds: [] }
    const oldState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: {} } },
    }
    const newState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: { '2.1.3[1]': instance } } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'task_instance_add',
      fieldId: 'dpia.2.1.3[1]',
      oldValue: null,
      newValue: instance,
    })
  })

  it('detects task instance remove', () => {
    const instance = { id: '2.1.3[1]', taskId: '2.1.3', groupId: null, parentInstanceId: null, childInstanceIds: [] }
    const oldState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: { '2.1.3[1]': instance } } },
    }
    const newState = {
      metadata: {},
      answers: {},
      taskState: { dpia: { completedRootTaskIds: [], taskInstances: {} } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      editType: 'task_instance_remove',
      fieldId: 'dpia.2.1.3[1]',
      oldValue: instance,
      newValue: null,
    })
  })

  it('uses URN-based field IDs when metadata has urn', () => {
    const oldState = { metadata: {}, answers: { dpia: { '2.1.3': { value: 'old' } } } }
    const newState = {
      metadata: { urn: 'urn:nl:dpia:3.0' },
      answers: { dpia: { '2.1.3': { value: 'new' } } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits[0].fieldId).toBe('urn:nl:dpia:3.0?=task_id=2.1.3')
  })

  it('uses URN-based field IDs with index for repeatable tasks', () => {
    const oldState = { metadata: {}, answers: { dpia: { '2.1.3[0]': { value: 'old' } } } }
    const newState = {
      metadata: { urn: 'urn:nl:dpia:3.0' },
      answers: { dpia: { '2.1.3[0]': { value: 'new' } } },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits[0].fieldId).toBe('urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0')
  })

  it('detects changes across multiple namespaces', () => {
    const oldState = {
      metadata: {},
      answers: {
        dpia: { '2.1': { value: 'a' } },
        prescan: { '1.1': { value: 'x' } },
      },
    }
    const newState = {
      metadata: {},
      answers: {
        dpia: { '2.1': { value: 'b' } },
        prescan: { '1.1': { value: 'y' } },
      },
    }
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toHaveLength(2)
    expect(edits.map(e => e.fieldId)).toContain('dpia.2.1')
    expect(edits.map(e => e.fieldId)).toContain('prescan.1.1')
  })

  it('handles navigation-only changes (no edits)', () => {
    const oldState = {
      metadata: {},
      answers: { dpia: { '2.1': { value: 'yes' } } },
      taskState: { dpia: { currentRootTaskId: '1', completedRootTaskIds: [], taskInstances: { '2.1': { id: '2.1' } } } },
    }
    const newState = {
      metadata: {},
      answers: { dpia: { '2.1': { value: 'yes' } } },
      taskState: { dpia: { currentRootTaskId: '2', completedRootTaskIds: [], taskInstances: { '2.1': { id: '2.1' } } } },
    }
    // currentRootTaskId change should NOT produce an edit (it's UI state)
    const edits = diffStates(oldState, newState, USER_ID)
    expect(edits).toEqual([])
  })

  it('handles empty old state gracefully', () => {
    const newState = {
      metadata: {},
      answers: { dpia: { '2.1': { value: 'yes' } } },
    }
    const edits = diffStates({}, newState, USER_ID)
    expect(edits).toHaveLength(1)
    expect(edits[0].editType).toBe('answer_change')
  })
})

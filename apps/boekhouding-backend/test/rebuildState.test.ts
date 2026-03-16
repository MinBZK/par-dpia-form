import { describe, it, expect } from 'vitest'

// rebuildState() depends on the database. We test the core replay logic
// by extracting it into a pure function that we can test without a DB.
// The actual rebuildState() in production queries edits from DB and replays them.

interface EditRow {
  fieldId: string
  editType: string
  newValue: unknown
}

/**
 * Pure replay logic extracted from rebuildState — applies edits to build state.
 * This mirrors the logic in src/utils/rebuildState.ts without the DB dependency.
 */
function replayEdits(edits: EditRow[]): unknown {
  let state: any = {}

  for (const edit of edits) {
    if (edit.editType === 'initial_state') {
      state = structuredClone(edit.newValue) ?? {}
      continue
    }

    const parsed = parseFieldId(edit.fieldId)
    if (!parsed) continue
    const { namespace, key } = parsed

    switch (edit.editType) {
      case 'answer_change': {
        if (!state.answers) state.answers = {}
        if (!state.answers[namespace]) state.answers[namespace] = {}
        if (edit.newValue === null) {
          delete state.answers[namespace][key]
        } else {
          state.answers[namespace][key] = edit.newValue
        }
        break
      }
      case 'section_complete': {
        if (!state.taskState) state.taskState = {}
        if (!state.taskState[namespace]) {
          state.taskState[namespace] = { currentRootTaskId: '', completedRootTaskIds: [], taskInstances: {} }
        }
        const completed: string[] = state.taskState[namespace].completedRootTaskIds
        const taskId = key.startsWith('completed.') ? key.substring('completed.'.length) : key
        if (edit.newValue === true) {
          if (!completed.includes(taskId)) completed.push(taskId)
        } else {
          const idx = completed.indexOf(taskId)
          if (idx !== -1) completed.splice(idx, 1)
        }
        break
      }
      case 'task_instance_add': {
        if (!state.taskState) state.taskState = {}
        if (!state.taskState[namespace]) {
          state.taskState[namespace] = { currentRootTaskId: '', completedRootTaskIds: [], taskInstances: {} }
        }
        state.taskState[namespace].taskInstances[key] = edit.newValue
        break
      }
      case 'task_instance_remove': {
        if (state.taskState?.[namespace]?.taskInstances) {
          delete state.taskState[namespace].taskInstances[key]
        }
        break
      }
    }
  }

  return state
}

function parseFieldId(fieldId: string): { namespace: string; key: string } | null {
  if (fieldId.startsWith('urn:')) {
    const match = fieldId.match(/^urn:nl:(\w+):[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/)
    if (!match) return null
    const namespace = match[1] === 'prescan_dpia' ? 'prescan' : match[1]
    const taskId = match[2]
    const index = match[3]
    const key = index !== undefined ? `${taskId}[${index}]` : taskId
    return { namespace, key }
  }
  const dotIndex = fieldId.indexOf('.')
  if (dotIndex === -1) return null
  return { namespace: fieldId.substring(0, dotIndex), key: fieldId.substring(dotIndex + 1) }
}

describe('rebuildState replay logic', () => {
  const initialState = {
    metadata: { createdAt: '2024-01-01', activeNamespace: 'dpia' },
    answers: { dpia: {} },
    taskState: { dpia: { currentRootTaskId: '1', completedRootTaskIds: [], taskInstances: {} } },
  }

  it('rebuild from only initial_state returns the initial state', () => {
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
    ])
    expect(result).toEqual(initialState)
  })

  it('rebuild with answer_change edits updates fields correctly', () => {
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      { fieldId: 'dpia.2.1', editType: 'answer_change', newValue: { value: 'yes' } },
      { fieldId: 'dpia.2.2', editType: 'answer_change', newValue: { value: 'no' } },
    ])
    expect((result as any).answers.dpia['2.1']).toEqual({ value: 'yes' })
    expect((result as any).answers.dpia['2.2']).toEqual({ value: 'no' })
  })

  it('rebuild with answer_change null deletes the field', () => {
    const stateWithAnswer = {
      ...initialState,
      answers: { dpia: { '2.1': { value: 'yes' } } },
    }
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: stateWithAnswer },
      { fieldId: 'dpia.2.1', editType: 'answer_change', newValue: null },
    ])
    expect((result as any).answers.dpia['2.1']).toBeUndefined()
  })

  it('rebuild with section_complete toggles correctly', () => {
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      { fieldId: 'dpia.completed.1', editType: 'section_complete', newValue: true },
      { fieldId: 'dpia.completed.2', editType: 'section_complete', newValue: true },
      { fieldId: 'dpia.completed.1', editType: 'section_complete', newValue: false },
    ])
    const completed = (result as any).taskState.dpia.completedRootTaskIds
    expect(completed).not.toContain('1')
    expect(completed).toContain('2')
  })

  it('rebuild with task_instance_add/remove handles instances correctly', () => {
    const instance = { id: '2.1.3[1]', taskId: '2.1.3', groupId: null, parentInstanceId: null, childInstanceIds: [] }
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      { fieldId: 'dpia.2.1.3[1]', editType: 'task_instance_add', newValue: instance },
    ])
    expect((result as any).taskState.dpia.taskInstances['2.1.3[1]']).toEqual(instance)

    // Now remove it
    const result2 = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      { fieldId: 'dpia.2.1.3[1]', editType: 'task_instance_add', newValue: instance },
      { fieldId: 'dpia.2.1.3[1]', editType: 'task_instance_remove', newValue: null },
    ])
    expect((result2 as any).taskState.dpia.taskInstances['2.1.3[1]']).toBeUndefined()
  })

  it('rebuild through multiple versions is cumulative', () => {
    // Simulates edits from version 1 (initial) + version 2 + version 3
    const result = replayEdits([
      // Version 1: initial
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      // Version 2: user fills in field 2.1
      { fieldId: 'dpia.2.1', editType: 'answer_change', newValue: { value: 'first' } },
      { fieldId: 'dpia.completed.1', editType: 'section_complete', newValue: true },
      // Version 3: user changes field 2.1, adds field 2.2
      { fieldId: 'dpia.2.1', editType: 'answer_change', newValue: { value: 'updated' } },
      { fieldId: 'dpia.2.2', editType: 'answer_change', newValue: { value: 'new' } },
    ])
    expect((result as any).answers.dpia['2.1']).toEqual({ value: 'updated' })
    expect((result as any).answers.dpia['2.2']).toEqual({ value: 'new' })
    expect((result as any).taskState.dpia.completedRootTaskIds).toContain('1')
  })

  it('handles URN-based field IDs', () => {
    const result = replayEdits([
      { fieldId: '__initial__', editType: 'initial_state', newValue: initialState },
      { fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.3', editType: 'answer_change', newValue: { value: 'test' } },
      { fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0', editType: 'answer_change', newValue: { value: 'indexed' } },
    ])
    expect((result as any).answers.dpia['2.1.3']).toEqual({ value: 'test' })
    expect((result as any).answers.dpia['2.1.3[0]']).toEqual({ value: 'indexed' })
  })
})

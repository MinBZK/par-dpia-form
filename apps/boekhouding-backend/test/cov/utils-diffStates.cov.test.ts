import { describe, it, expect } from 'vitest'
import { parseInstanceId, buildFieldUrn, diffStates } from '../../src/utils/diffStates.js'
import type { EditRecord } from '../../src/utils/diffStates.js'

const URN = 'urn:nl:dpia:3.0'
const USER = 'sam@example.com'

function findEdit(edits: EditRecord[], fieldId: string): EditRecord | undefined {
  return edits.find((e) => e.fieldId === fieldId)
}

describe('parseInstanceId', () => {
  it('parses an instance id with an index', () => {
    expect(parseInstanceId('2.1.3[0]')).toEqual({ taskId: '2.1.3', index: 0 })
    expect(parseInstanceId('foo[12]')).toEqual({ taskId: 'foo', index: 12 })
  })

  it('returns only the taskId when there is no index suffix', () => {
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
    expect(parseInstanceId('foo[bar]')).toEqual({ taskId: 'foo[bar]' })
  })
})

describe('buildFieldUrn', () => {
  it('appends task_index when the instance id has an index', () => {
    expect(buildFieldUrn(URN, '2.1.3[0]')).toBe('urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0')
  })

  it('omits task_index when the instance id has no index', () => {
    expect(buildFieldUrn(URN, '2.1.3')).toBe('urn:nl:dpia:3.0?=task_id=2.1.3')
  })
})

describe('diffStates — simple answers', () => {
  it('emits an answer_change with URN field id when a value changes', () => {
    const oldState = { metadata: { urn: URN }, answers: { '1.1': { value: 'Inleiding' } } }
    const newState = { metadata: { urn: URN }, answers: { '1.1': { value: 'Aanleiding' } } }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      fieldId: 'urn:nl:dpia:3.0?=task_id=1.1',
      editType: 'answer_change',
      editedBy: USER,
      oldValue: { value: 'Inleiding' },
      newValue: { value: 'Aanleiding' },
    })
  })

  it('uses the bare key as field id when no urn is present', () => {
    const oldState = { answers: { '1.1': { value: 'Inleiding' } } }
    const newState = { answers: { '1.1': { value: 'Aanleiding' } } }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].fieldId).toBe('1.1')
  })

  it('does not emit an edit when an answer is unchanged', () => {
    const state = { metadata: { urn: URN }, answers: { '1.1': { value: 'same' } } }
    const edits = diffStates(state, state, USER)
    expect(edits).toHaveLength(0)
  })

  it('falls back to null for old/new values that are undefined', () => {
    const added = diffStates(
      { metadata: { urn: URN }, answers: {} },
      { metadata: { urn: URN }, answers: { '1.1': { value: 'new' } } },
      USER,
    )
    expect(added[0].oldValue).toBeNull()
    expect(added[0].newValue).toEqual({ value: 'new' })

    const removed = diffStates(
      { metadata: { urn: URN }, answers: { '1.1': { value: 'old' } } },
      { metadata: { urn: URN }, answers: {} },
      USER,
    )
    expect(removed[0].newValue).toBeNull()
    expect(removed[0].oldValue).toEqual({ value: 'old' })
  })
})

describe('diffStates — defaulting and missing structures', () => {
  it('returns no edits for two empty/undefined states', () => {
    expect(diffStates(undefined, undefined, USER)).toEqual([])
    expect(diffStates(null, null, USER)).toEqual([])
    expect(diffStates({}, {}, USER)).toEqual([])
  })

  it('handles a new state with no metadata object at all', () => {
    const edits = diffStates({}, { answers: { x: { value: 1 } } }, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].fieldId).toBe('x')
  })
})

describe('diffStates — grouped arrays (repeatable groups)', () => {
  it('treats a non-grouped array (no numeric _index) as a plain value', () => {
    const oldState = { metadata: { urn: URN }, answers: { list: [{ foo: 1 }] } }
    const newState = { metadata: { urn: URN }, answers: { list: [{ foo: 2 }] } }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].editType).toBe('answer_change')
    expect(edits[0].fieldId).toBe('urn:nl:dpia:3.0?=task_id=list')
  })

  it('treats an empty array as a plain value (length 0)', () => {
    const edits = diffStates(
      { metadata: { urn: URN }, answers: { list: [] } },
      { metadata: { urn: URN }, answers: { list: [{ value: 'x' }] } },
      USER,
    )
    expect(edits).toHaveLength(1)
    expect(edits[0].editType).toBe('answer_change')
  })

  it('treats an array whose first element is null as a plain value', () => {
    const edits = diffStates(
      { metadata: { urn: URN }, answers: { list: [null] } },
      { metadata: { urn: URN }, answers: { list: [{ value: 'x' }] } },
      USER,
    )
    expect(edits).toHaveLength(1)
    expect(edits[0].editType).toBe('answer_change')
  })

  it('detects a changed child field within a grouped array (old grouped, new grouped)', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' }, '2.1.2': { value: 'Medewerkers' } }] },
    }
    const newState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'Telefoon' }, '2.1.2': { value: 'Medewerkers' } }] },
    }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0',
      editType: 'answer_change',
      editedBy: USER,
      oldValue: { value: 'E-mail' },
      newValue: { value: 'Telefoon' },
    })
  })

  it('uses bare child field ids inside grouped arrays when no urn is present', () => {
    const oldState = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'a' } }] } }
    const newState = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'b' } }] } }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].fieldId).toBe('2.1.1[0]')
  })

  it('falls back to null for child old/new values that are undefined', () => {
    const edits = diffStates(
      { metadata: { urn: URN }, answers: { '2.1': [{ _index: 1, '2.1.1': { value: 'x' } }] } },
      { metadata: { urn: URN }, answers: { '2.1': [{ _index: 1, '2.1.1': { value: 'x' }, '2.1.2': { value: 'y' } }] } },
      USER,
    )
    const e = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1.2&task_index=1')!
    expect(e.oldValue).toBeNull()
    expect(e.newValue).toEqual({ value: 'y' })
  })

  it('emits instance_added when a non-default instance index appears in the new array', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'first' } }] },
    }
    const newState = {
      metadata: { urn: URN },
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: 'first' } },
          { _index: 1, '2.1.1': { value: 'second' } },
        ],
      },
    }
    const edits = diffStates(oldState, newState, USER)
    const added = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1')!
    expect(added.editType).toBe('instance_added')
    expect(added.oldValue).toBeNull()
    expect(added.newValue).toEqual({ '2.1.1': { value: 'second' } })
  })

  it('emits instance_removed and bundles the removed child values', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: 'first' } },
          { _index: 1, '2.1.1': { value: 'second' } },
        ],
      },
    }
    const newState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'first' } }] },
    }
    const edits = diffStates(oldState, newState, USER)
    const removed = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1')!
    expect(removed.editType).toBe('instance_removed')
    expect(removed.oldValue).toEqual({ '2.1.1': { value: 'second' } })
    expect(removed.newValue).toBeNull()
  })

  it('uses a bare instance id for added/removed instances when no urn is present', () => {
    const oldState = { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'a' } }] } }
    const newState = {
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: 'a' } },
          { _index: 1, '2.1.1': { value: 'b' } },
        ],
      },
    }
    const edits = diffStates(oldState, newState, USER)
    const added = findEdit(edits, '2.1[1]')!
    expect(added.editType).toBe('instance_added')
  })

  it('skips the default index-0 instance when a grouped key is newly saved', () => {
    const oldState = { metadata: { urn: URN }, answers: {} }
    const newState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'first' } }] },
    }
    const edits = diffStates(oldState, newState, USER)
    expect(edits.filter((e) => e.editType === 'instance_added')).toHaveLength(0)
    expect(edits).toHaveLength(0)
  })

  it('does NOT skip a newly-saved instance at index 0 when other indices already existed', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 1, '2.1.1': { value: 'kept' } }] },
    }
    const newState = {
      metadata: { urn: URN },
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: 'new-at-zero' } },
          { _index: 1, '2.1.1': { value: 'kept' } },
        ],
      },
    }
    const edits = diffStates(oldState, newState, USER)
    const addedZero = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0')!
    expect(addedZero.editType).toBe('instance_added')
    expect(addedZero.newValue).toEqual({ '2.1.1': { value: 'new-at-zero' } })
  })

  it('produces null bundled values when a removed instance has no child fields', () => {
    const oldState = { metadata: { urn: URN }, answers: { '2.1': [{ _index: 5 }] } }
    const newState = { metadata: { urn: URN }, answers: {} }
    const edits = diffStates(oldState, newState, USER)
    const removed = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=5')!
    expect(removed.editType).toBe('instance_removed')
    expect(removed.oldValue).toBeNull()
    expect(removed.newValue).toBeNull()
  })

  it('produces null bundled newValue when an added instance has no child fields', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'first' } }] },
    }
    const newState = {
      metadata: { urn: URN },
      answers: {
        '2.1': [
          { _index: 0, '2.1.1': { value: 'first' } },
          { _index: 1 },
        ],
      },
    }
    const edits = diffStates(oldState, newState, USER)
    const added = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1')!
    expect(added.editType).toBe('instance_added')
    expect(added.oldValue).toBeNull()
    expect(added.newValue).toBeNull()
  })

  it('falls back to null for a child newValue that is undefined (child removed, instance kept)', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 2, '2.1.1': { value: 'x' }, '2.1.2': { value: 'y' } }] },
    }
    const newState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 2, '2.1.1': { value: 'x' } }] },
    }
    const edits = diffStates(oldState, newState, USER)
    const e = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1.2&task_index=2')!
    expect(e.editType).toBe('answer_change')
    expect(e.oldValue).toEqual({ value: 'y' })
    expect(e.newValue).toBeNull()
  })

  it('does not emit child edits when grouped instances are identical', () => {
    const state = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'same' } }] },
    }
    expect(diffStates(state, state, USER)).toHaveLength(0)
  })

  it('handles old grouped vs new non-grouped (new becomes undefined arg)', () => {
    const oldState = {
      metadata: { urn: URN },
      answers: { '2.1': [{ _index: 3, '2.1.1': { value: 'gone' } }] },
    }
    const newState = { metadata: { urn: URN }, answers: { '2.1': null } }
    const edits = diffStates(oldState, newState, USER)
    const removed = findEdit(edits, 'urn:nl:dpia:3.0?=task_id=2.1&task_index=3')!
    expect(removed.editType).toBe('instance_removed')
  })
})

describe('diffStates — completedTasks', () => {
  it('emits section_complete=true for newly completed tasks (with urn)', () => {
    const oldState = { metadata: { urn: URN, completedTasks: [] }, answers: {} }
    const newState = { metadata: { urn: URN, completedTasks: ['1'] }, answers: {} }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.1',
      editType: 'section_complete',
      editedBy: USER,
      oldValue: false,
      newValue: true,
    })
  })

  it('emits section_complete=false for newly uncompleted tasks', () => {
    const oldState = { metadata: { urn: URN, completedTasks: ['1', '2'] }, answers: {} }
    const newState = { metadata: { urn: URN, completedTasks: ['2'] }, answers: {} }
    const edits = diffStates(oldState, newState, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.1',
      editType: 'section_complete',
      editedBy: USER,
      oldValue: true,
      newValue: false,
    })
  })

  it('uses bare completed.<id> field ids when no urn is present', () => {
    const added = diffStates(
      { metadata: { completedTasks: [] }, answers: {} },
      { metadata: { completedTasks: ['1'] }, answers: {} },
      USER,
    )
    expect(added[0].fieldId).toBe('completed.1')

    const removed = diffStates(
      { metadata: { completedTasks: ['1'] }, answers: {} },
      { metadata: { completedTasks: [] }, answers: {} },
      USER,
    )
    expect(removed[0].fieldId).toBe('completed.1')
  })

  it('defaults missing completedTasks lists to empty sets', () => {
    const edits = diffStates({ metadata: {}, answers: {} }, { metadata: {}, answers: {} }, USER)
    expect(edits).toEqual([])
  })

  it('does not emit anything when completedTasks are unchanged', () => {
    const state = { metadata: { urn: URN, completedTasks: ['1'] }, answers: {} }
    expect(diffStates(state, state, USER)).toHaveLength(0)
  })
})

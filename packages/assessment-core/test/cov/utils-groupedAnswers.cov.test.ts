import { describe, it, expect } from 'vitest'
import { groupAnswers, flattenGroupedAnswers } from '../../src/utils/groupedAnswers'
import type { FlatTask, TaskInstance } from '../../src/stores/tasks'
import type { Answer } from '../../src/stores/answers'

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

// Task tree:
//   2 -> 2.1 (repeatable) -> 2.1.1, 2.1.2
//   0 -> 0.1 (non-repeatable)
const flatTasks: Record<string, FlatTask> = {
  '2': {
    id: '2', task: 'Section', type: ['task_group'],
    parentId: null, childrenIds: ['2.1'],
  },
  '2.1': {
    id: '2.1', task: 'Repeatable group', type: ['task_group'],
    parentId: '2', childrenIds: ['2.1.1', '2.1.2'], repeatable: true,
  },
  '2.1.1': {
    id: '2.1.1', task: 'Field A', type: ['text'],
    parentId: '2.1', childrenIds: [],
  },
  '2.1.2': {
    id: '2.1.2', task: 'Field B', type: ['text'],
    parentId: '2.1', childrenIds: [],
  },
  '0': {
    id: '0', task: 'Intro', type: ['task_group'],
    parentId: null, childrenIds: ['0.1'],
  },
  '0.1': {
    id: '0.1', task: 'Project name', type: ['text'],
    parentId: '0', childrenIds: [],
  },
}

describe('groupAnswers', () => {
  it('groups repeatable children and passes non-repeatable answers through', () => {
    const flat: Record<string, Answer> = {
      '0.1': answer('My project'),
      '2.1.1[0]': answer('Email'),
      '2.1.2[0]': answer('Employees'),
      '2.1.1[1]': answer('Phone'),
      '2.1.2[1]': answer('Customers'),
    }

    const grouped = groupAnswers(flat, flatTasks)

    expect(grouped['0.1']).toEqual(answer('My project'))
    const arr = grouped['2.1'] as any[]
    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual(answer('Email'))
    expect(arr[0]['2.1.2']).toEqual(answer('Employees'))
    expect(arr[1]._index).toBe(1)
    expect(arr[1]['2.1.1']).toEqual(answer('Phone'))
    expect(arr[1]['2.1.2']).toEqual(answer('Customers'))
  })

  it('treats an indexed child of a repeatable parent whose own taskId is not a child as non-repeatable', () => {
    // "2.1[0]" parses to { taskId: "2.1", index: 0 }. "2.1" is a repeatable
    // PARENT, not in childToRepeatableParent — so it falls to the else branch.
    const flat: Record<string, Answer> = {
      '2.1[0]': answer('Parent-level value'),
    }

    const grouped = groupAnswers(flat, flatTasks)

    // Passed through unchanged under its full instance id.
    expect(grouped['2.1[0]']).toEqual(answer('Parent-level value'))
  })

  it('treats a non-indexed repeatable child key as non-repeatable (index undefined branch)', () => {
    // "2.1.1" parses to { taskId: "2.1.1" } with index undefined, so even
    // though it IS a repeatable child the index===undefined check fails.
    const flat: Record<string, Answer> = {
      '2.1.1': answer('No index'),
    }

    const grouped = groupAnswers(flat, flatTasks)

    expect(grouped['2.1.1']).toEqual(answer('No index'))
    expect(grouped['2.1']).toBeUndefined()
  })

  it('preserves index gaps and sorts elements by _index', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[5]': answer('Z'),
      '2.1.1[0]': answer('A'),
      '2.1.1[3]': answer('M'),
    }

    const grouped = groupAnswers(flat, flatTasks)
    const arr = grouped['2.1'] as any[]

    expect(arr.map((e: any) => e._index)).toEqual([0, 3, 5])
  })

  it('handles empty answers', () => {
    expect(groupAnswers({}, flatTasks)).toEqual({})
  })

  it('handles repeatable with only one field filled', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[0]': answer('Email'),
    }

    const grouped = groupAnswers(flat, flatTasks)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(1)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual(answer('Email'))
    expect(arr[0]['2.1.2']).toBeUndefined()
  })

  it('includes empty instances when taskInstances has more than one index', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[1]': answer('Phone'),
      '2.1.2[1]': answer('Customers'),
    }

    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
      '2.1[1]': { id: '2.1[1]', taskId: '2.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
      // An unrelated instance whose taskId !== '2.1' (exercises false branch on line 71)
      'other[0]': { id: 'other[0]', taskId: 'other', groupId: 'gx', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(Object.keys(arr[0])).toEqual(['_index']) // empty instance preserved
    expect(arr[1]._index).toBe(1)
    expect(arr[1]['2.1.1']).toEqual(answer('Phone'))
    // The unrelated instance never created its own grouped entry.
    expect(grouped['other']).toBeUndefined()
  })

  it('adds empty instances even when grouped already exists for the parent', () => {
    // grouped.has('2.1') is true (index 1 has answers) AND there is an extra
    // empty instance index 3 -> exercises line 78 short-circuit (size<=1 false)
    // and the !parentMap.has(index) true branch at line 86.
    const flat: Record<string, Answer> = {
      '2.1.1[1]': answer('Phone'),
    }
    const taskInstances: Record<string, TaskInstance> = {
      '2.1[1]': { id: '2.1[1]', taskId: '2.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
      '2.1[3]': { id: '2.1[3]', taskId: '2.1', groupId: 'g3', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    const arr = grouped['2.1'] as any[]

    expect(arr.map((e: any) => e._index)).toEqual([1, 3])
    expect(arr[0]['2.1.1']).toEqual(answer('Phone')) // existing element kept
    expect(Object.keys(arr[1])).toEqual(['_index']) // new empty instance added
  })

  it('does not add empty parentMap entries that already have answers', () => {
    // Both index 0 and 1 carry answers AND both exist as taskInstances. The
    // !parentMap.has(index) check at line 86 is FALSE for both -> no overwrite.
    const flat: Record<string, Answer> = {
      '2.1.1[0]': answer('A'),
      '2.1.1[1]': answer('B'),
    }
    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
      '2.1[1]': { id: '2.1[1]', taskId: '2.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(2)
    expect(arr[0]['2.1.1']).toEqual(answer('A'))
    expect(arr[1]['2.1.1']).toEqual(answer('B'))
  })

  it('creates a fresh grouped entry for multiple empty instances with no answers', () => {
    // Two instances, NO answers at all -> grouped.has('2.1') is false but
    // size>1 passes the line-78 guard, so line 81 (grouped.set) executes.
    const flat: Record<string, Answer> = {}
    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
      '2.1[1]': { id: '2.1[1]', taskId: '2.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    const arr = grouped['2.1'] as any[]

    expect(arr.map((e: any) => e._index)).toEqual([0, 1])
    expect(Object.keys(arr[0])).toEqual(['_index'])
    expect(Object.keys(arr[1])).toEqual(['_index'])
  })

  it('skips a single default instance with no answers', () => {
    const flat: Record<string, Answer> = {
      '0.1': answer('My project'),
    }
    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    expect(grouped['2.1']).toBeUndefined()
    expect(grouped['0.1']).toEqual(answer('My project'))
  })

  it('ignores taskInstance ids without an index (parsed.index undefined branch)', () => {
    // Instance id without [n] -> parseInstanceId yields index undefined, so it
    // is never added to existingIndices. With only this instance the size is 0,
    // size<=1 and grouped.has is false -> the parent is skipped entirely.
    const flat: Record<string, Answer> = {}
    const taskInstances: Record<string, TaskInstance> = {
      '2.1': { id: '2.1', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    expect(grouped['2.1']).toBeUndefined()
  })

  it('does not add empty instances when taskInstances is omitted', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[1]': answer('Phone'),
    }

    const grouped = groupAnswers(flat, flatTasks)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(1)
    expect(arr[0]._index).toBe(1)
  })
})

describe('flattenGroupedAnswers', () => {
  it('flattens grouped arrays back to instance keys (skipping _index keys)', () => {
    const grouped = {
      '0.1': answer('My project'),
      '2.1': [
        { _index: 0, '2.1.1': answer('Email'), '2.1.2': answer('Employees') },
        { _index: 2, '2.1.1': answer('Phone'), '2.1.2': answer('Customers') },
      ],
    }

    const flat = flattenGroupedAnswers(grouped as any)

    expect(flat['0.1']).toEqual(answer('My project'))
    expect(flat['2.1.1[0]']).toEqual(answer('Email'))
    expect(flat['2.1.2[0]']).toEqual(answer('Employees'))
    expect(flat['2.1.1[2]']).toEqual(answer('Phone'))
    expect(flat['2.1.2[2]']).toEqual(answer('Customers'))
    expect(flat['2.1.1[1]']).toBeUndefined()
  })

  it('handles empty grouped object', () => {
    expect(flattenGroupedAnswers({})).toEqual({})
  })

  it('passes regular flat answers through (isAnswer true branch)', () => {
    const grouped = {
      '0.1': answer('My project'),
      '1.2': answer('Description'),
    }

    expect(flattenGroupedAnswers(grouped as any)).toEqual(grouped)
  })

  it('skips values that are neither arrays nor Answer objects (isAnswer false branches)', () => {
    // Each value exercises a distinct failing condition in isAnswer:
    //  - missingValue: object, non-null, non-array, but no 'value' key
    //  - nullValue:    typeof object but === null
    //  - stringValue:  not typeof object
    const grouped = {
      missingValue: { lastEditedAt: 'x' },
      nullValue: null,
      stringValue: 'plain',
      ok: answer('Kept'),
    }

    const flat = flattenGroupedAnswers(grouped as any)

    expect(flat['ok']).toEqual(answer('Kept'))
    expect(flat['missingValue']).toBeUndefined()
    expect(flat['nullValue']).toBeUndefined()
    expect(flat['stringValue']).toBeUndefined()
  })
})

describe('roundtrip', () => {
  it('preserves all data through a group -> flatten cycle', () => {
    const original: Record<string, Answer> = {
      '0.1': answer('My project'),
      '2.1.1[0]': answer('Email'),
      '2.1.2[0]': answer('Employees'),
      '2.1.1[2]': answer('Phone'),
      '2.1.2[2]': answer('Customers'),
    }

    const restored = flattenGroupedAnswers(groupAnswers(original, flatTasks) as any)
    expect(restored).toEqual(original)
  })
})

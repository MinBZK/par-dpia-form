import { describe, it, expect } from 'vitest'
import { groupAnswers, flattenGroupedAnswers } from '../src/utils/groupedAnswers'
import type { FlatTask, TaskInstance } from '../src/stores/tasks'
import type { Answer } from '../src/stores/answers'

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

// Minimal task tree: 2 → 2.1 (repeatable) → 2.1.1, 2.1.2
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
  it('groups repeatable children under parent key', () => {
    const flat: Record<string, Answer> = {
      '0.1': answer('My project'),
      '2.1.1[0]': answer('Email'),
      '2.1.2[0]': answer('Employees'),
      '2.1.1[1]': answer('Phone'),
      '2.1.2[1]': answer('Customers'),
    }

    const grouped = groupAnswers(flat, flatTasks)

    // Non-repeatable answer passes through
    expect(grouped['0.1']).toEqual(answer('My project'))

    // Repeatable children are grouped under parent
    expect(Array.isArray(grouped['2.1'])).toBe(true)
    const arr = grouped['2.1'] as any[]
    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual(answer('Email'))
    expect(arr[0]['2.1.2']).toEqual(answer('Employees'))
    expect(arr[1]._index).toBe(1)
    expect(arr[1]['2.1.1']).toEqual(answer('Phone'))
    expect(arr[1]['2.1.2']).toEqual(answer('Customers'))

    // Flat child keys are NOT present as top-level keys
    expect(grouped['2.1.1[0]']).toBeUndefined()
    expect(grouped['2.1.2[1]']).toBeUndefined()
  })

  it('preserves index gaps (deleted instances)', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[0]': answer('Email'),
      '2.1.2[0]': answer('Employees'),
      // Index 1 was deleted
      '2.1.1[2]': answer('Phone'),
      '2.1.2[2]': answer('Customers'),
    }

    const grouped = groupAnswers(flat, flatTasks)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(arr[1]._index).toBe(2) // Gap preserved
  })

  it('sorts elements by _index', () => {
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
    const grouped = groupAnswers({}, flatTasks)
    expect(grouped).toEqual({})
  })

  it('handles only non-repeatable answers', () => {
    const flat: Record<string, Answer> = {
      '0.1': answer('My project'),
    }

    const grouped = groupAnswers(flat, flatTasks)
    expect(grouped).toEqual({ '0.1': answer('My project') })
  })

  it('handles repeatable with partial children (only one field filled)', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[0]': answer('Email'),
      // 2.1.2[0] not filled
    }

    const grouped = groupAnswers(flat, flatTasks)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(1)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual(answer('Email'))
    expect(arr[0]['2.1.2']).toBeUndefined()
  })

  it('includes empty instances when taskInstances is provided', () => {
    // Only index 1 has answers, but both 0 and 1 exist as instances
    const flat: Record<string, Answer> = {
      '2.1.1[1]': answer('Phone'),
      '2.1.2[1]': answer('Customers'),
    }

    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
      '2.1[1]': { id: '2.1[1]', taskId: '2.1', groupId: 'g1', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    const arr = grouped['2.1'] as any[]

    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(Object.keys(arr[0])).toEqual(['_index']) // empty instance
    expect(arr[1]._index).toBe(1)
    expect(arr[1]['2.1.1']).toEqual(answer('Phone'))
  })

  it('does not include single default instance (no noise for every repeatable)', () => {
    const flat: Record<string, Answer> = {
      '0.1': answer('My project'),
    }

    // Only the default [0] instance — should NOT produce a grouped entry
    const taskInstances: Record<string, TaskInstance> = {
      '2.1[0]': { id: '2.1[0]', taskId: '2.1', groupId: 'g0', parentInstanceId: null, childInstanceIds: [] },
    }

    const grouped = groupAnswers(flat, flatTasks, taskInstances)
    expect(grouped['2.1']).toBeUndefined()
    expect(grouped['0.1']).toEqual(answer('My project'))
  })

  it('does not add empty instances without taskInstances parameter', () => {
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
  it('flattens grouped arrays back to instance keys', () => {
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
    // No flat key for index 1 (it was deleted)
    expect(flat['2.1.1[1]']).toBeUndefined()
  })

  it('handles empty grouped object', () => {
    expect(flattenGroupedAnswers({})).toEqual({})
  })

  it('handles only non-repeatable answers', () => {
    const grouped = {
      '0.1': answer('My project'),
      '1.2': answer('Description'),
    }

    const flat = flattenGroupedAnswers(grouped as any)
    expect(flat).toEqual(grouped)
  })
})

describe('roundtrip: group → flatten', () => {
  it('preserves all data through a group/flatten cycle', () => {
    const original: Record<string, Answer> = {
      '0.1': answer('My project'),
      '2.1.1[0]': answer('Email'),
      '2.1.2[0]': answer('Employees'),
      '2.1.1[2]': answer('Phone'),
      '2.1.2[2]': answer('Customers'),
    }

    const grouped = groupAnswers(original, flatTasks)
    const restored = flattenGroupedAnswers(grouped as any)

    expect(restored).toEqual(original)
  })

  it('preserves data through flatten/group cycle', () => {
    const grouped = {
      '0.1': answer('My project'),
      '2.1': [
        { _index: 0, '2.1.1': answer('Email'), '2.1.2': answer('Employees') },
        { _index: 5, '2.1.1': answer('Phone') },
      ],
    }

    const flat = flattenGroupedAnswers(grouped as any)
    const regrouped = groupAnswers(flat, flatTasks)

    expect(regrouped['0.1']).toEqual(answer('My project'))
    const arr = regrouped['2.1'] as any[]
    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual(answer('Email'))
    expect(arr[0]['2.1.2']).toEqual(answer('Employees'))
    expect(arr[1]._index).toBe(5)
    expect(arr[1]['2.1.1']).toEqual(answer('Phone'))
  })
})

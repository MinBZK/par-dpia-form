import { describe, it, expect } from 'vitest'
import { groupAnswers, flattenGroupedAnswers } from '../src/utils/groupedAnswers'
import { parseAndValidateImport } from '../src/utils/importDetect'
import type { FlatTask, TaskInstance } from '../src/stores/tasks'
import type { Answer } from '../src/stores/answers'
import type { GroupedAnswerValue } from '../src/models/assessmentState'

/**
 * Answers live in two shapes: flat instance keys ("2.1.1[0]") inside the stores,
 * grouped `_index` arrays in the database, the export and the API. Every write
 * path has to produce the grouped shape, and the conversion between the two has
 * to lose nothing — an import that wrote the flat shape once made the next save
 * look like hundreds of structural edits (8be1439).
 *
 * These are the invariants both directions have to hold, over a generated set of
 * cases rather than the handful of hand-picked ones in groupedAnswers.test.ts.
 */

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

// Two repeatable groups plus a non-repeatable field, so grouping has to keep
// parents apart instead of collapsing everything under one key.
const flatTasks: Record<string, FlatTask> = {
  '0': { id: '0', task: 'Intro', type: ['task_group'], parentId: null, childrenIds: ['0.1'] },
  '0.1': { id: '0.1', task: 'Project name', type: ['text'], parentId: '0', childrenIds: [] },
  '2': { id: '2', task: 'Section', type: ['task_group'], parentId: null, childrenIds: ['2.1'] },
  '2.1': {
    id: '2.1', task: 'Data', type: ['task_group'],
    parentId: '2', childrenIds: ['2.1.1', '2.1.2'], repeatable: true,
  },
  '2.1.1': { id: '2.1.1', task: 'Field A', type: ['text'], parentId: '2.1', childrenIds: [] },
  '2.1.2': { id: '2.1.2', task: 'Field B', type: ['text'], parentId: '2.1', childrenIds: [] },
  '3': { id: '3', task: 'Section', type: ['task_group'], parentId: null, childrenIds: ['3.1'] },
  '3.1': {
    id: '3.1', task: 'Parties', type: ['task_group'],
    parentId: '3', childrenIds: ['3.1.1'], repeatable: true,
  },
  '3.1.1': { id: '3.1.1', task: 'Party', type: ['text'], parentId: '3.1', childrenIds: [] },
}

// Index sets worth covering: the default alone, a gap where an instance was
// deleted, a set that starts past 0, and a wide spread out of order.
const INDEX_SETS = [[0], [0, 1], [0, 2], [1, 2], [2], [0, 1, 2, 5], [4, 1]]

function flatCase(indices: number[], opts: { partial?: boolean; second?: boolean } = {}) {
  const flat: Record<string, Answer> = { '0.1': answer('My project') }
  for (const i of indices) {
    flat[`2.1.1[${i}]`] = answer(`A${i}`)
    if (!opts.partial) flat[`2.1.2[${i}]`] = answer(`B${i}`)
    if (opts.second) flat[`3.1.1[${i}]`] = answer(`P${i}`)
  }
  return flat
}

function instancesFor(indices: number[], taskId: string): Record<string, TaskInstance> {
  const instances: Record<string, TaskInstance> = {}
  for (const i of indices) {
    instances[`${taskId}[${i}]`] = { id: `${taskId}[${i}]`, taskId, parentId: null } as TaskInstance
  }
  return instances
}

describe('answer shape: flat → grouped → flat', () => {
  for (const indices of INDEX_SETS) {
    for (const opts of [{}, { partial: true }, { second: true }]) {
      const label = `${JSON.stringify(indices)} ${JSON.stringify(opts)}`

      it(`round-trips ${label} without losing an answer`, () => {
        const flat = flatCase(indices, opts)
        const restored = flattenGroupedAnswers(groupAnswers(flat, flatTasks) as Record<string, GroupedAnswerValue>)
        expect({ ...restored }).toEqual(flat)
      })

      it(`keeps every index of ${label} intact, gaps and all`, () => {
        const grouped = groupAnswers(flatCase(indices, opts), flatTasks)
        const elements = grouped['2.1'] as Array<{ _index: number }>
        expect(elements.map((e) => e._index)).toEqual([...indices].sort((a, b) => a - b))
      })
    }
  }

  it('never renumbers around a gap', () => {
    const grouped = groupAnswers(flatCase([0, 2, 5]), flatTasks)
    expect((grouped['2.1'] as Array<{ _index: number }>).map((e) => e._index)).toEqual([0, 2, 5])
  })

  it('sorts elements by index whatever order the keys came in', () => {
    const flat: Record<string, Answer> = {
      '2.1.1[5]': answer('last'),
      '2.1.1[0]': answer('first'),
      '2.1.1[2]': answer('middle'),
    }
    const elements = groupAnswers(flat, flatTasks) as Record<string, Array<{ _index: number }>>
    expect(elements['2.1'].map((e) => e._index)).toEqual([0, 2, 5])
  })

  it('keeps the two repeatable parents apart', () => {
    const grouped = groupAnswers(flatCase([0, 1], { second: true }), flatTasks)
    expect(Object.keys(grouped).sort()).toEqual(['0.1', '2.1', '3.1'])
  })
})

describe('answer shape: grouped → flat → grouped', () => {
  for (const indices of INDEX_SETS) {
    it(`round-trips ${JSON.stringify(indices)} back to the same grouped shape`, () => {
      const original: Record<string, GroupedAnswerValue> = {
        '0.1': answer('My project'),
        '2.1': [...indices]
          .sort((a, b) => a - b)
          .map((i) => ({ _index: i, '2.1.1': answer(`A${i}`), '2.1.2': answer(`B${i}`) })),
      }
      const regrouped = groupAnswers(flattenGroupedAnswers(original), flatTasks)
      expect(regrouped).toEqual(original)
    })
  }

  it('preserves an instance that has no answers yet', () => {
    const original: Record<string, GroupedAnswerValue> = {
      '2.1': [{ _index: 0, '2.1.1': answer('A0') }, { _index: 1 }],
    }
    const regrouped = groupAnswers(
      flattenGroupedAnswers(original),
      flatTasks,
      instancesFor([0, 1], '2.1'),
    )
    expect(regrouped).toEqual(original)
  })
})

describe('answer shape: every write path produces the grouped shape', () => {
  const exported = {
    $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
    metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z', completedTasks: ['0'] },
    answers: {
      '0.1': answer('My project'),
      '2.1': [
        { _index: 0, '2.1.1': answer('A0'), '2.1.2': answer('B0') },
        { _index: 2, '2.1.1': answer('A2') },
      ],
    },
  }

  it('hands an import back in the same shape a save writes', () => {
    const imported = parseAndValidateImport(JSON.stringify(exported))
    // The flat shape here is what made the first save after an import look like
    // hundreds of structural edits, so this is the regression that matters.
    expect(Array.isArray(imported.answers!['2.1'])).toBe(true)
    expect(imported.answers).toEqual(exported.answers)
  })

  it('survives an import followed by a save without a structural change', () => {
    const imported = parseAndValidateImport(JSON.stringify(exported))
    const saved = groupAnswers(
      flattenGroupedAnswers(imported.answers as Record<string, GroupedAnswerValue>),
      flatTasks,
      instancesFor([0, 2], '2.1'),
    )
    expect(saved).toEqual(imported.answers)
  })
})

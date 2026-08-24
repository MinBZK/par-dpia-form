import { describe, it, expect } from 'vitest'
import { diffStates } from '../src/utils/diffStates.js'

const URN = 'urn:nl:dpia:3.0'
const USER = 'sam@example.com'

const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

/** The shape every write path has to produce: repeatable groups as _index arrays. */
const groupedState = {
  metadata: { urn: URN, completedTasks: [] },
  answers: {
    '0.1': answer('My project'),
    '2.1': [
      { _index: 0, '2.1.1': answer('A0'), '2.1.2': answer('B0') },
      { _index: 2, '2.1.1': answer('A2') },
    ],
  },
}

/** The same answers written flat, as an import once stored them. */
const flatState = {
  metadata: { urn: URN, completedTasks: [] },
  answers: {
    '0.1': answer('My project'),
    '2.1.1[0]': answer('A0'),
    '2.1.2[0]': answer('B0'),
    '2.1.1[2]': answer('A2'),
  },
}

describe('first save after an import', () => {
  it('records no edits when nothing changed', () => {
    expect(diffStates(groupedState, structuredClone(groupedState), USER)).toEqual([])
  })

  it('records only the answer that changed', () => {
    const next = structuredClone(groupedState)
    next.answers['2.1'][0]['2.1.1'] = answer('A0 herzien')
    const edits = diffStates(groupedState, next, USER)
    expect(edits).toHaveLength(1)
    expect(edits[0].fieldId).toBe('urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0')
    expect(edits[0].editType).toBe('answer_change')
  })

  it('turns into structural noise when the two versions carry different shapes', () => {
    // Why the import path has to write grouped answers: with a flat version 1,
    // the first ordinary save reads as the group being created from scratch.
    const edits = diffStates(flatState, groupedState, USER)
    expect(edits.length).toBeGreaterThan(1)
    expect(edits.some((e) => e.editType === 'instance_added')).toBe(true)
  })
})

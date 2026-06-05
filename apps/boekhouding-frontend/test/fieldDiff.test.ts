import { describe, it, expect } from 'vitest'
import type { AssessmentState } from '@overheid-assessment/core'
import { computeFieldDiff } from '../src/utils/fieldDiff'

function state(answers: Record<string, unknown>, completedTasks: string[] = []): AssessmentState {
  return {
    metadata: {
      createdAt: '2026-04-12T00:00:00Z',
      urn: 'urn:nl:dpia:3.0',
      completedTasks,
    },
    answers,
  } as AssessmentState
}

describe('computeFieldDiff', () => {
  it('returns empty diff for two null states', () => {
    expect(computeFieldDiff(null, null).size).toBe(0)
  })

  it('treats referentially identical values as unchanged', () => {
    const obj = { value: 'x', lastEditedAt: 't' }
    const diff = computeFieldDiff(state({ '1.1': obj }), state({ '1.1': obj }))
    expect(diff.size).toBe(0)
  })

  it('treats equal primitive values as unchanged', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'hello' } }),
      state({ '1.1': { value: 'hello' } }),
    )
    expect(diff.size).toBe(0)
  })

  it('treats two undefined values as unchanged', () => {
    const diff = computeFieldDiff(state({}), state({}))
    expect(diff.size).toBe(0)
  })

  it('detects a changed primitive-wrapped value', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'old' } }),
      state({ '1.1': { value: 'new' } }),
    )
    expect(diff.get('1.1')).toEqual({
      oldValue: { value: 'old' },
      newValue: { value: 'new' },
    })
  })

  it('detects a newly added key', () => {
    const diff = computeFieldDiff(state({}), state({ '2.1': { value: 'x' } }))
    expect(diff.get('2.1')).toEqual({ oldValue: null, newValue: { value: 'x' } })
  })

  it('detects a removed key', () => {
    const diff = computeFieldDiff(state({ '2.1': { value: 'x' } }), state({}))
    expect(diff.get('2.1')).toEqual({ oldValue: { value: 'x' }, newValue: null })
  })

  it('treats deeply equal repeatable-group arrays as unchanged', () => {
    const rows = [
      { _index: 0, '2.1.1': { value: 'E-mail' } },
      { _index: 1, '2.1.1': { value: 'Telefoon' } },
    ]
    const diff = computeFieldDiff(
      state({ '2.1': rows }),
      state({ '2.1': JSON.parse(JSON.stringify(rows)) }),
    )
    expect(diff.size).toBe(0)
  })

  it('detects a mutation inside a repeatable-group array', () => {
    const diff = computeFieldDiff(
      state({ '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' } }] }),
      state({ '2.1': [{ _index: 0, '2.1.1': { value: 'Adres' } }] }),
    )
    expect(diff.has('2.1')).toBe(true)
  })

  it('distinguishes null from undefined', () => {
    const diff = computeFieldDiff(
      state({ '1.1': null as unknown as { value: string } }),
      state({ '1.1': undefined as unknown as { value: string } }),
    )
    expect(diff.has('1.1')).toBe(true)
  })

  it('tracks newly completed tasks', () => {
    const diff = computeFieldDiff(state({}, []), state({}, ['1']))
    expect(diff.get('completed.1')).toEqual({ oldValue: false, newValue: true })
  })

  it('tracks newly uncompleted tasks', () => {
    const diff = computeFieldDiff(state({}, ['1']), state({}, []))
    expect(diff.get('completed.1')).toEqual({ oldValue: true, newValue: false })
  })
})

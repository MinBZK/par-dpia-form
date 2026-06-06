import { describe, it, expect } from 'vitest'
import type { AssessmentState } from '@overheid-assessment/core'
import { computeFieldDiff } from '../../src/utils/fieldDiff'

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

describe('computeFieldDiff — null / empty state handling', () => {
  it('returns an empty diff for two null states', () => {
    const diff = computeFieldDiff(null, null)
    expect(diff.size).toBe(0)
  })

  it('returns an empty diff for two empty answer maps', () => {
    const diff = computeFieldDiff(state({}), state({}))
    expect(diff.size).toBe(0)
  })

  it('detects additions when old state is null but new state has answers', () => {
    const diff = computeFieldDiff(null, state({ '1.1': { value: 'Inleiding' } }))
    expect(diff.get('1.1')).toEqual({ oldValue: null, newValue: { value: 'Inleiding' } })
  })

  it('detects removals when new state is null but old state has answers', () => {
    const diff = computeFieldDiff(state({ '1.1': { value: 'Inleiding' } }), null)
    expect(diff.get('1.1')).toEqual({ oldValue: { value: 'Inleiding' }, newValue: null })
  })
})

describe('computeFieldDiff — valuesEqual fast paths', () => {
  it('treats referentially identical object values as unchanged (a === b true)', () => {
    const obj = { value: 'Inleiding', lastEditedAt: '2026-04-12T00:00:00Z' }
    const diff = computeFieldDiff(state({ '1.1': obj }), state({ '1.1': obj }))
    expect(diff.size).toBe(0)
  })

  it('treats equal primitive-wrapped values as unchanged (JSON.stringify equal)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'Inleiding' } }),
      state({ '1.1': { value: 'Inleiding' } }),
    )
    expect(diff.size).toBe(0)
  })

  it('treats two undefined values as unchanged (a === b true via both undefined)', () => {
    const diff = computeFieldDiff(state({ a: undefined }), state({ b: undefined }))
    expect(diff.size).toBe(0)
  })

  it('treats two null values as unchanged (a == null && a === b)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': null as unknown as { value: string } }),
      state({ '1.1': null as unknown as { value: string } }),
    )
    expect(diff.size).toBe(0)
  })
})

describe('computeFieldDiff — valuesEqual null/undefined asymmetry', () => {
  it('distinguishes null from undefined (a == null true, a === b false)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': null as unknown as { value: string } }),
      state({ '1.1': undefined as unknown as { value: string } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: null, newValue: null })
  })

  it('distinguishes undefined from null (b == null true via b only)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': undefined as unknown as { value: string } }),
      state({ '1.1': null as unknown as { value: string } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: null, newValue: null })
  })

  it('detects a value changing from an object to null (b == null right side)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'Inleiding' } }),
      state({ '1.1': null as unknown as { value: string } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: { value: 'Inleiding' }, newValue: null })
  })
})

describe('computeFieldDiff — valuesEqual typeof checks', () => {
  it('treats equal string primitives as unchanged via JSON.stringify (both objects path)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'Inleiding' } }),
      state({ '1.1': { value: 'Inleiding' } }),
    )
    expect(diff.size).toBe(0)
  })

  it('detects a difference when old is a non-object primitive and new is an object', () => {
    const diff = computeFieldDiff(
      state({ '1.1': 'Inleiding' as unknown as { value: string } }),
      state({ '1.1': { value: 'Inleiding' } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: 'Inleiding', newValue: { value: 'Inleiding' } })
  })

  it('detects a difference when old is an object and new is a non-object primitive', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 42 } }),
      state({ '1.1': 42 as unknown as { value: number } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: { value: 42 }, newValue: 42 })
  })

  it('treats two equal non-object primitives that are not reference-equal correctly', () => {
    const diff = computeFieldDiff(
      state({ '1.1': 'Inleiding' as unknown as { value: string } }),
      state({ '1.1': 'Inleiding' as unknown as { value: string } }),
    )
    expect(diff.size).toBe(0)
  })

  it('detects differing non-object primitives (a===b false, both non-null, a non-object)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': 'Inleiding' as unknown as { value: string } }),
      state({ '1.1': 'Verwerkingsdoeleinden' as unknown as { value: string } }),
    )
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')).toEqual({ oldValue: 'Inleiding', newValue: 'Verwerkingsdoeleinden' })
  })
})

describe('computeFieldDiff — JSON.stringify deep comparison', () => {
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

  it('detects a mutation inside a repeatable-group array (JSON.stringify differs)', () => {
    const diff = computeFieldDiff(
      state({ '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' } }] }),
      state({ '2.1': [{ _index: 0, '2.1.1': { value: 'Adres' } }] }),
    )
    expect(diff.has('2.1')).toBe(true)
  })
})

describe('computeFieldDiff — added and removed keys', () => {
  it('detects a newly added key (oldVal undefined -> null via ??)', () => {
    const diff = computeFieldDiff(state({}), state({ '2.1': { value: 'E-mail' } }))
    expect(diff.get('2.1')).toEqual({ oldValue: null, newValue: { value: 'E-mail' } })
  })

  it('detects a removed key (newVal undefined -> null via ??)', () => {
    const diff = computeFieldDiff(state({ '2.1': { value: 'E-mail' } }), state({}))
    expect(diff.get('2.1')).toEqual({ oldValue: { value: 'E-mail' }, newValue: null })
  })

  it('detects a changed primitive-wrapped value (both defined, no ?? fallback)', () => {
    const diff = computeFieldDiff(
      state({ '1.1': { value: 'Inleiding' } }),
      state({ '1.1': { value: 'Verwerkingsdoeleinden' } }),
    )
    expect(diff.get('1.1')).toEqual({
      oldValue: { value: 'Inleiding' },
      newValue: { value: 'Verwerkingsdoeleinden' },
    })
  })
})

describe('computeFieldDiff — completedTasks tracking', () => {
  it('tracks newly completed tasks (in new, not in old)', () => {
    const diff = computeFieldDiff(state({}, []), state({}, ['1']))
    expect(diff.get('completed.1')).toEqual({ oldValue: false, newValue: true })
  })

  it('tracks newly uncompleted tasks (in old, not in new)', () => {
    const diff = computeFieldDiff(state({}, ['1']), state({}, []))
    expect(diff.get('completed.1')).toEqual({ oldValue: true, newValue: false })
  })

  it('does not record tasks that are completed in both states', () => {
    const diff = computeFieldDiff(state({}, ['1']), state({}, ['1']))
    expect(diff.has('completed.1')).toBe(false)
    expect(diff.size).toBe(0)
  })

  it('handles a mix of added and removed completions in one diff', () => {
    const diff = computeFieldDiff(state({}, ['1', '2']), state({}, ['2', '3']))
    expect(diff.get('completed.3')).toEqual({ oldValue: false, newValue: true })
    expect(diff.get('completed.1')).toEqual({ oldValue: true, newValue: false })
    expect(diff.has('completed.2')).toBe(false)
  })

  it('falls back to empty completedTasks when metadata.completedTasks is absent', () => {
    const noTasks = {
      metadata: { createdAt: '2026-04-12T00:00:00Z', urn: 'urn:nl:dpia:3.0' },
      answers: {},
    } as AssessmentState
    const diff = computeFieldDiff(noTasks, noTasks)
    expect(diff.size).toBe(0)
  })
})

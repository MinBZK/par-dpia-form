import { describe, it, expect } from 'vitest'
import { stripUnknownStateKeys } from '../../src/utils/sanitizeState.js'

const SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

function legacyState() {
  return {
    $schema: SCHEMA_URL,
    metadata: {
      urn: 'urn:nl:dpia:3.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedTasks: ['0'],
      activeNamespace: 'dpia',
    },
    answers: { '0.1': { value: 'x', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
    _prescanAnswers: { '0.1': { value: 'p', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
    taskState: { dpia: { completedRootTaskIds: ['0'] } },
    smuggled: 'x'.repeat(10),
  }
}

describe('stripUnknownStateKeys', () => {
  it('keeps every key the output schema defines', () => {
    const { state: result } = stripUnknownStateKeys(legacyState())
    const kept = result as Record<string, unknown>
    expect(Object.keys(kept)).toEqual(['$schema', 'metadata', 'answers', '_prescanAnswers'])
    expect(kept.answers).toEqual({ '0.1': { value: 'x', lastEditedAt: '2026-01-01T00:00:00.000Z' } })
    expect(Object.keys(kept.metadata as object)).toEqual(['urn', 'createdAt', 'completedTasks'])
  })

  it('drops the legacy taskState and metadata.activeNamespace instead of rejecting them', () => {
    const { state: result } = stripUnknownStateKeys(legacyState())
    const kept = result as Record<string, unknown>
    expect(kept).not.toHaveProperty('taskState')
    expect(kept).not.toHaveProperty('smuggled')
    expect(kept.metadata).not.toHaveProperty('activeNamespace')
  })

  it('keeps metadata.createdBy, which the audit export writes', () => {
    const { state } = stripUnknownStateKeys({
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z', createdBy: { name: 'Sam' } },
    })
    expect((state as Record<string, unknown>).metadata).toEqual({
      urn: 'urn:nl:dpia:3.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: { name: 'Sam' },
    })
  })

  it('leaves a non-object metadata untouched for the schema to reject', () => {
    const { state } = stripUnknownStateKeys({ metadata: 'geen object', answers: {} })
    expect((state as Record<string, unknown>).metadata).toBe('geen object')
  })

  it('returns non-objects unchanged (the schema rejects them)', () => {
    expect(stripUnknownStateKeys(null).state).toBe(null)
    expect(stripUnknownStateKeys('tekst').state).toBe('tekst')
    expect(stripUnknownStateKeys([1, 2]).state).toEqual([1, 2])
    expect(stripUnknownStateKeys(null).dropped).toEqual([])
  })

  it('reports every dropped key so the caller can log it', () => {
    const { dropped } = stripUnknownStateKeys(legacyState())
    expect(dropped).toEqual(['taskState', 'smuggled', 'metadata.activeNamespace'])
  })

  it('reports nothing when the state only carries defined keys', () => {
    const { dropped } = stripUnknownStateKeys({
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z' },
      answers: {},
    })
    expect(dropped).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = legacyState()
    stripUnknownStateKeys(input)
    expect(input).toHaveProperty('taskState')
    expect(input.metadata).toHaveProperty('activeNamespace')
  })
})

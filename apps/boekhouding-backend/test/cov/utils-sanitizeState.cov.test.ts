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
    const result = stripUnknownStateKeys(legacyState()) as Record<string, unknown>
    expect(Object.keys(result)).toEqual(['$schema', 'metadata', 'answers', '_prescanAnswers'])
    expect(result.answers).toEqual({ '0.1': { value: 'x', lastEditedAt: '2026-01-01T00:00:00.000Z' } })
    expect(Object.keys(result.metadata as object)).toEqual(['urn', 'createdAt', 'completedTasks'])
  })

  it('drops the legacy taskState and metadata.activeNamespace instead of rejecting them', () => {
    const result = stripUnknownStateKeys(legacyState()) as Record<string, unknown>
    expect(result).not.toHaveProperty('taskState')
    expect(result).not.toHaveProperty('smuggled')
    expect(result.metadata).not.toHaveProperty('activeNamespace')
  })

  it('keeps metadata.createdBy, which the audit export writes', () => {
    const result = stripUnknownStateKeys({
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z', createdBy: { name: 'Sam' } },
    }) as Record<string, unknown>
    expect(result.metadata).toEqual({
      urn: 'urn:nl:dpia:3.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: { name: 'Sam' },
    })
  })

  it('leaves a non-object metadata untouched for the schema to reject', () => {
    const result = stripUnknownStateKeys({ metadata: 'geen object', answers: {} }) as Record<string, unknown>
    expect(result.metadata).toBe('geen object')
  })

  it('returns non-objects unchanged (the schema rejects them)', () => {
    expect(stripUnknownStateKeys(null)).toBe(null)
    expect(stripUnknownStateKeys('tekst')).toBe('tekst')
    expect(stripUnknownStateKeys([1, 2])).toEqual([1, 2])
  })

  it('does not mutate its input', () => {
    const input = legacyState()
    stripUnknownStateKeys(input)
    expect(input).toHaveProperty('taskState')
    expect(input.metadata).toHaveProperty('activeNamespace')
  })
})

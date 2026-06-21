import { describe, it, expect } from 'vitest'
import { normalizeCreateState, ASSESSMENT_TYPE_URNS, DEFAULT_DEFINITION_VERSIONS } from '../../src/utils/normalizeCreateState.js'
import { OUTPUT_SCHEMA_URL } from '../../src/utils/validateState.js'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

describe('ASSESSMENT_TYPE_URNS', () => {
  it('carries a versioned URN per assessment type', () => {
    expect(ASSESSMENT_TYPE_URNS).toEqual({
      prescan: 'urn:nl:prescan:2.0',
      dpia: 'urn:nl:dpia:3.0',
      iama: 'urn:nl:iama:2.0',
    })
  })
})

describe('DEFAULT_DEFINITION_VERSIONS', () => {
  it('carries the latest-official version per type', () => {
    expect(DEFAULT_DEFINITION_VERSIONS).toEqual({ prescan: '2.0', dpia: '3.0', iama: '2.0' })
  })
})

describe('normalizeCreateState', () => {
  it('fills $schema, metadata.urn/createdAt and answers for a fully lean state', () => {
    const result = normalizeCreateState({}, 'dpia')
    expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(result.answers).toEqual({})
    const metadata = result.metadata as Record<string, unknown>
    expect(metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(metadata.createdAt).toMatch(ISO)
  })

  it('derives the URN from the assessment type', () => {
    expect((normalizeCreateState({}, 'prescan').metadata as Record<string, unknown>).urn).toBe('urn:nl:prescan:2.0')
    expect((normalizeCreateState({}, 'iama').metadata as Record<string, unknown>).urn).toBe('urn:nl:iama:2.0')
  })

  it('composes the urn from a provided definitionVersion (concept stays precise)', () => {
    const result = normalizeCreateState({}, 'dpia', '3.1.0-concept.2')
    expect((result.metadata as Record<string, unknown>).urn).toBe('urn:nl:dpia:3.1.0-concept.2')
  })

  it('composes a coarse official urn from a MAJOR.MINOR definitionVersion', () => {
    const result = normalizeCreateState({}, 'iama', '2.1')
    expect((result.metadata as Record<string, unknown>).urn).toBe('urn:nl:iama:2.1')
  })

  it('preserves values the client did provide and never overwrites them', () => {
    const input = {
      $schema: 'client-schema',
      metadata: { urn: 'urn:nl:dpia:2.0', createdAt: '2020-01-01T00:00:00.000Z', createdBy: { name: 'Sam' } },
      answers: { '0.1': { value: 'x', lastEditedAt: '2020-01-01T00:00:00.000Z' } },
    }
    const result = normalizeCreateState(input, 'dpia')
    expect(result.$schema).toBe('client-schema')
    const metadata = result.metadata as Record<string, unknown>
    expect(metadata.urn).toBe('urn:nl:dpia:2.0')
    expect(metadata.createdAt).toBe('2020-01-01T00:00:00.000Z')
    expect(metadata.createdBy).toEqual({ name: 'Sam' })
    expect(result.answers).toEqual({ '0.1': { value: 'x', lastEditedAt: '2020-01-01T00:00:00.000Z' } })
  })

  it('preserves extra top-level keys such as _prescanAnswers', () => {
    const result = normalizeCreateState(
      { metadata: { createdAt: '2026-01-01T00:00:00.000Z' }, answers: {}, _prescanAnswers: { '0.1': { value: 'p' } } },
      'dpia',
    )
    expect(result._prescanAnswers).toEqual({ '0.1': { value: 'p' } })
    const metadata = result.metadata as Record<string, unknown>
    expect(metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(metadata.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('replaces a null metadata with a generated one', () => {
    const result = normalizeCreateState({ metadata: null }, 'dpia')
    const metadata = result.metadata as Record<string, unknown>
    expect(metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(metadata.createdAt).toMatch(ISO)
  })

  it('replaces non-string $schema and non-object answers with defaults', () => {
    const result = normalizeCreateState({ $schema: 123, answers: 'oops' }, 'dpia')
    expect(result.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(result.answers).toEqual({})
  })

  it('does not mutate the input object', () => {
    const input = { answers: { '0.1': { value: 'x', lastEditedAt: '2020-01-01T00:00:00.000Z' } } }
    const snapshot = JSON.parse(JSON.stringify(input))
    normalizeCreateState(input, 'dpia')
    expect(input).toEqual(snapshot)
  })
})

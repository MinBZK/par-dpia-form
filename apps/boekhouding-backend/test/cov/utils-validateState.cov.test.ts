import { describe, it, expect } from 'vitest'
import { validateState, OUTPUT_SCHEMA_URL } from '../../src/utils/validateState.js'

const SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

describe('OUTPUT_SCHEMA_URL', () => {
  it('is derived from the schema $schema const', () => {
    expect(OUTPUT_SCHEMA_URL).toBe(SCHEMA_URL)
  })
})

function validState(answers: Record<string, unknown> = {}) {
  return {
    $schema: SCHEMA_URL,
    metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z' },
    answers,
  }
}

const answer = (value: unknown) => ({ value, lastEditedAt: '2026-01-01T00:00:00.000Z' })

describe('validateState', () => {
  it('accepts a conforming export-shaped state', () => {
    const result = validateState(validState({ '0.1': answer('Inleiding') }))
    expect(result.valid).toBe(true)
    expect(result.errors).toBe('')
  })

  it('accepts a grouped repeatable answer', () => {
    const result = validateState(validState({
      '2.1': [
        { _index: 0, '2.1.1': answer('Email') },
        { _index: 1 },
      ],
    }))
    expect(result.valid).toBe(true)
  })

  it('accepts an allowed embedded image value', () => {
    const result = validateState(validState({
      '0.1': answer({ data: 'data:image/png;base64,iVBORw0KGgo=', title: 'Diagram' }),
    }))
    expect(result.valid).toBe(true)
  })

  it('accepts the extra top-level _prescanAnswers field the DPIA client sends', () => {
    const result = validateState({
      ...validState({ '0.1': answer('x') }),
      _prescanAnswers: { '0.1': answer('leftover') },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts grouped repeatable answers inside _prescanAnswers', () => {
    const result = validateState({
      ...validState(),
      _prescanAnswers: { '2.1': [{ _index: 0, '2.1.1': answer('Email') }] },
    })
    expect(result.valid).toBe(true)
  })

  // The schema stays open at the root on purpose: an export from before the v2
  // migration carries `taskState` and `metadata.activeNamespace` and still
  // declares this schema URL, so closing it would retroactively invalidate
  // files this app produced itself. stripUnknownStateKeys drops those keys
  // before they can be persisted, and logs what it dropped.
  it('accepts a legacy key at the root, which the stripper removes instead', () => {
    const result = validateState({ ...validState(), taskState: { dpia: {} } })
    expect(result.valid).toBe(true)
  })

  it('accepts a legacy metadata key, which the stripper removes instead', () => {
    const result = validateState({
      ...validState(),
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z', activeNamespace: 'dpia' },
    })
    expect(result.valid).toBe(true)
  })

  it('still rejects a malformed _prescanAnswers key', () => {
    const result = validateState({
      ...validState(),
      _prescanAnswers: { 'geen-taak-id': answer('x') },
    })
    expect(result.valid).toBe(false)
  })

  it('accepts a realistic full client payload (drift guard for buildApiState)', () => {
    // Mirrors every shape buildApiState() emits in one payload — text, checkbox
    // array, embedded image, a grouped repeatable with a nested image, completed
    // tasks, and the _prescanAnswers envelope. If strict validation ever starts
    // rejecting a legitimate save, this test fails before it reaches production.
    const result = validateState({
      $schema: SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z', completedTasks: ['0', '1'] },
      answers: {
        '0.1': answer('Projectnaam'),
        '0.2': answer(['optie-a', 'optie-b']),
        '0.3': answer({ data: 'data:image/webp;base64,UklGRg==', title: 'Diagram', source: 'arch.webp' }),
        '2.1': [
          { _index: 0, '2.1.1': answer('Email'), '2.1.2': answer({ data: 'data:image/png;base64,iVBORw0KGgo=' }) },
          { _index: 1, '2.1.1': answer('Telefoon') },
        ],
      },
      _prescanAnswers: { '0.1': answer('prescan waarde') },
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toBe('')
  })

  it('rejects state missing $schema and reports an error', () => {
    const { $schema, ...withoutSchema } = validState()
    const result = validateState(withoutSchema)
    expect(result.valid).toBe(false)
    expect(result.errors).not.toBe('')
  })

  it('rejects state missing metadata.urn', () => {
    const result = validateState({
      $schema: SCHEMA_URL,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z' },
      answers: {},
    })
    expect(result.valid).toBe(false)
  })

  it('rejects an invalid answer key', () => {
    const result = validateState(validState({ 'invalid key': answer('x') }))
    expect(result.valid).toBe(false)
  })

  it('rejects non-numeric completedTasks', () => {
    const result = validateState({
      $schema: SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z', completedTasks: ['abc'] },
      answers: {},
    })
    expect(result.valid).toBe(false)
  })

  it('rejects a grouped element without _index', () => {
    const result = validateState(validState({ '2.1': [{ '2.1.1': answer('x') }] }))
    expect(result.valid).toBe(false)
  })

  it('rejects a grouped element with a __proto__ child key', () => {
    // JSON.parse makes __proto__ a real own property (unlike an object literal,
    // where __proto__: sets the prototype). This is how it arrives over HTTP.
    const groups = JSON.parse('[{"_index":0,"__proto__":{"value":"x","lastEditedAt":"2026-01-01T00:00:00.000Z"}}]')
    const result = validateState(validState({ '2.1': groups }))
    expect(result.valid).toBe(false)
  })

  it('rejects an image value whose data is not a data:image URI', () => {
    const result = validateState(validState({ '0.1': answer({ data: 'javascript:alert(1)' }) }))
    expect(result.valid).toBe(false)
  })
})

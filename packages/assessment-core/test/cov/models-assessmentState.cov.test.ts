import { describe, it, expect } from 'vitest'
import {
  OUTPUT_SCHEMA_URL,
  type AssessmentState,
  type GroupedAnswers,
  type GroupedAnswerValue,
  type IndexedGroupElement,
} from '../../src/models/assessmentState'
import type { Answer } from '../../src/stores/answers'

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('OUTPUT_SCHEMA_URL', () => {
  it('points at the v2 assessment-output schema on GitHub', () => {
    expect(OUTPUT_SCHEMA_URL).toBe(
      'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
    )
  })

  it('is a stable string constant', () => {
    expect(typeof OUTPUT_SCHEMA_URL).toBe('string')
    expect(OUTPUT_SCHEMA_URL.endsWith('assessment-output.v2.schema.json')).toBe(true)
  })
})

describe('IndexedGroupElement type', () => {
  it('carries a numeric _index alongside child Answer values', () => {
    const element: IndexedGroupElement = {
      _index: 0,
      '2.1.1': answer('E-mailadres'),
      '2.1.2': answer('Medewerkers'),
    }

    expect(element._index).toBe(0)
    expect(element['2.1.1']).toEqual(answer('E-mailadres'))
    expect(element['2.1.2']).toEqual(answer('Medewerkers'))
  })

  it('allows index gaps (deleted instances keep their original index)', () => {
    const element: IndexedGroupElement = { _index: 2, '2.1.1': answer('Telefoon') }
    expect(element._index).toBe(2)
  })
})

describe('GroupedAnswerValue type', () => {
  it('can be a single Answer for non-repeatable tasks', () => {
    const value: GroupedAnswerValue = answer('Inleiding')
    expect(value).toEqual(answer('Inleiding'))
    expect(Array.isArray(value)).toBe(false)
  })

  it('can be an IndexedGroupElement array for repeatable tasks', () => {
    const value: GroupedAnswerValue = [
      { _index: 0, '2.1.1': answer('E-mailadres'), '2.1.2': answer('Medewerkers') },
      { _index: 2, '2.1.1': answer('Telefoon'), '2.1.2': answer('Klanten') },
    ]

    expect(Array.isArray(value)).toBe(true)
    expect(value).toHaveLength(2)
    expect(value[0]._index).toBe(0)
    expect(value[1]._index).toBe(2)
  })
})

describe('GroupedAnswers type', () => {
  it('maps task IDs to either Answers or grouped arrays', () => {
    const grouped: GroupedAnswers = {
      '0.1': answer('Inleiding'),
      '2.1': [
        { _index: 0, '2.1.1': answer('E-mailadres') },
        { _index: 2, '2.1.1': answer('Telefoon') },
      ],
    }

    expect(grouped['0.1']).toEqual(answer('Inleiding'))
    expect(Array.isArray(grouped['2.1'])).toBe(true)
  })
})

describe('AssessmentState type', () => {
  it('represents a full unified assessment state with optional fields', () => {
    const state: AssessmentState = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: {
        urn: 'urn:nl:dpia:3.0',
        createdAt: '2026-03-20T12:00:00Z',
        completedTasks: ['0', '1'],
        createdBy: { name: 'Sam', email: 'sam@example.com' },
      },
      answers: {
        '0.1': answer('Inleiding'),
        '2.1': [
          { _index: 0, '2.1.1': answer('E-mailadres'), '2.1.2': answer('Medewerkers') },
        ],
      },
    }

    expect(state.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(state.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(state.metadata.createdAt).toBe('2026-03-20T12:00:00Z')
    expect(state.metadata.completedTasks).toEqual(['0', '1'])
    expect(state.metadata.createdBy).toEqual({ name: 'Sam', email: 'sam@example.com' })
    expect(state.answers['0.1']).toEqual(answer('Inleiding'))
  })

  it('works with only the required metadata.createdAt and answers fields', () => {
    const state: AssessmentState = {
      metadata: { createdAt: '2026-03-20T12:00:00Z' },
      answers: {},
    }

    expect(state.$schema).toBeUndefined()
    expect(state.metadata.urn).toBeUndefined()
    expect(state.metadata.completedTasks).toBeUndefined()
    expect(state.metadata.createdBy).toBeUndefined()
    expect(state.answers).toEqual({})
  })

  it('allows createdBy without an email', () => {
    const state: AssessmentState = {
      metadata: { createdAt: '2026-03-20T12:00:00Z', createdBy: { name: 'Noor' } },
      answers: {},
    }

    expect(state.metadata.createdBy).toEqual({ name: 'Noor' })
    expect(state.metadata.createdBy?.email).toBeUndefined()
  })
})

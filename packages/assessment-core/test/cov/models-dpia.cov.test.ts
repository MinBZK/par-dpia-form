import { describe, it, expect } from 'vitest'
import { isRight, isLeft } from 'fp-ts/Either'
import * as dpia from '../../src/models/dpia'

describe('FormType enum', () => {
  it('exposes DPIA and PRE_SCAN string values', () => {
    expect(dpia.FormType.DPIA).toBe('dpia')
    expect(dpia.FormType.PRE_SCAN).toBe('prescan')
  })
})

describe('codecs decode valid values', () => {
  it('decodes a fully populated Task tree (triggers recursion thunk)', () => {
    const value = {
      task: 'Verwerkingsdoeleinden',
      id: '2',
      type: ['task_group'],
      is_official_id: true,
      valueType: 'string',
      instance_label_template: 'Persoonsgegeven {index}',
      description: 'Beschrijf de doeleinden van de verwerking',
      category: 'Doelbinding',
      repeatable: true,
      tasks: [
        {
          task: 'Categorie persoonsgegevens',
          id: '2.1',
          type: ['text_input'],
          options: [{ value: 'email', label: 'E-mailadres' }, { value: true }, { value: null }],
          sources: [{ source: 'AVG art. 5', description: 'Beginselen verwerking' }, { source: 'AVG art. 6' }],
          dependencies: [
            {
              type: 'visibility',
              action: 'show',
              condition: { id: '2.2', operator: 'eq', value: 'ja' },
              source: { id: '2.3' },
              mapping_type: 'one-to-one',
            },
            { type: 'enable', action: 'hide' },
          ],
          defaultValue: 'Niet ingevuld',
          calculation: {
            expression: 'score_a + score_b',
            scoreKey: 'risicoScore',
            riskScore: [{ when: 'hoog', value: 3 }],
          },
          references: {
            prescanModelId: 'prescan-2.1',
            DPIA: [{ id: 'dpia-2.1', type: 'pre-fill' }],
          },
        },
      ],
    }
    const result = dpia.Task.decode(value)
    expect(isRight(result)).toBe(true)
  })

  it('decodes a minimal Task with only required fields', () => {
    const result = dpia.Task.decode({ task: 'Datum verwerking', id: '2.4', type: ['date'] })
    expect(isRight(result)).toBe(true)
  })

  it('rejects an invalid Task (missing required id)', () => {
    const result = dpia.Task.decode({ task: 'Datum verwerking', type: ['date'] })
    expect(isLeft(result)).toBe(true)
  })

  it('decodes all TaskTypeValue literals', () => {
    for (const tt of [
      'task_group', 'signing', 'text_input', 'open_text',
      'date', 'select_option', 'radio_option', 'checkbox_option', 'image',
    ]) {
      expect(isRight(dpia.TaskTypeValue.decode(tt))).toBe(true)
    }
    expect(isLeft(dpia.TaskTypeValue.decode('unknown'))).toBe(true)
  })

  it('decodes Tasks array', () => {
    const result = dpia.Tasks.decode([{ task: 'Diagram gegevensstromen', id: '3.1', type: ['image'] }])
    expect(isRight(result)).toBe(true)
  })

  it('decodes Source with and without description', () => {
    expect(isRight(dpia.Source.decode({ source: 'AVG art. 35' }))).toBe(true)
    expect(isRight(dpia.Source.decode({ source: 'AVG art. 35', description: 'DPIA-verplichting' }))).toBe(true)
  })

  it('decodes Option value union variants', () => {
    expect(isRight(dpia.Option.decode({ value: 'email', label: 'E-mailadres' }))).toBe(true)
    expect(isRight(dpia.Option.decode({ value: false }))).toBe(true)
    expect(isRight(dpia.Option.decode({ value: null }))).toBe(true)
    expect(isLeft(dpia.Option.decode({ value: 1 }))).toBe(true)
  })

  it('decodes Condition with and without optional value', () => {
    expect(isRight(dpia.Condition.decode({ id: '2.2', operator: 'eq' }))).toBe(true)
    expect(isRight(dpia.Condition.decode({ id: '2.2', operator: 'eq', value: true }))).toBe(true)
  })

  it('decodes Dependency with full and minimal shape', () => {
    expect(isRight(dpia.Dependency.decode({ type: 'visibility', action: 'show' }))).toBe(true)
    expect(
      isRight(
        dpia.Dependency.decode({
          type: 'visibility',
          action: 'show',
          condition: { id: '2.2', operator: 'eq' },
          source: { id: '2.3' },
          mapping_type: 'one-to-one',
        }),
      ),
    ).toBe(true)
  })

  it('decodes RiskScore', () => {
    expect(isRight(dpia.RiskScore.decode({ when: 'hoog', value: 1 }))).toBe(true)
    expect(isLeft(dpia.RiskScore.decode({ when: 'hoog' }))).toBe(true)
  })

  it('decodes Calculation full and minimal', () => {
    expect(isRight(dpia.Calculation.decode({ expression: 'score_a + score_b' }))).toBe(true)
    expect(
      isRight(
        dpia.Calculation.decode({
          expression: 'score_a + score_b',
          scoreKey: 'risicoScore',
          riskScore: [{ when: 'hoog', value: 2 }],
        }),
      ),
    ).toBe(true)
  })

  it('decodes ReferenceType literals', () => {
    for (const rt of ['pre-view', 'pre-fill', 'one-to-one', 'one-to-many', 'many-to-many']) {
      expect(isRight(dpia.ReferenceType.decode(rt))).toBe(true)
    }
    expect(isLeft(dpia.ReferenceType.decode('nope'))).toBe(true)
  })

  it('decodes TaskReference and TaskReferences', () => {
    expect(isRight(dpia.TaskReference.decode({ id: 'dpia-2.1', type: 'one-to-many' }))).toBe(true)
    expect(isRight(dpia.TaskReferences.decode({}))).toBe(true)
    expect(
      isRight(dpia.TaskReferences.decode({ prescanModelId: 'prescan-2.1', DPIA: [{ id: 'dpia-2.1', type: 'pre-view' }] })),
    ).toBe(true)
  })

  it('decodes Criterion', () => {
    expect(isRight(dpia.Criterion.decode({ id: 'crit-1', expression: 'risicoScore >= 3', explanation: 'Hoog risico' }))).toBe(true)
  })

  it('decodes AssessmentLevel full and minimal', () => {
    expect(isRight(dpia.AssessmentLevel.decode({ level: 'hoog', expression: 'risicoScore >= 3', result: 'DPIA verplicht' }))).toBe(true)
    expect(
      isRight(
        dpia.AssessmentLevel.decode({
          level: 'hoog',
          expression: 'risicoScore >= 3',
          result: 'DPIA verplicht',
          explanation: 'Verwerking met hoog risico',
          criteria: [{ id: 'crit-1', expression: 'risicoScore >= 3', explanation: 'Hoog risico' }],
        }),
      ),
    ).toBe(true)
  })

  it('decodes Assessment', () => {
    expect(
      isRight(
        dpia.Assessment.decode({
          id: 'dpia-noodzaak',
          levels: [{ level: 'hoog', expression: 'risicoScore >= 3', result: 'DPIA verplicht' }],
        }),
      ),
    ).toBe(true)
  })

  it('decodes DPIA full and minimal', () => {
    expect(
      isRight(
        dpia.DPIA.decode({
          name: 'DPIA',
          urn: 'urn:nl:dpia:3.0',
          version: '3.0',
          description: 'Data Protection Impact Assessment',
          tasks: [{ task: 'Inleiding', id: '0', type: ['task_group'] }],
        }),
      ),
    ).toBe(true)
    expect(
      isRight(
        dpia.DPIA.decode({
          name: 'DPIA',
          urn: 'urn:nl:dpia:3.0',
          version: '3.0',
          description: 'Data Protection Impact Assessment',
          tasks: [],
          assessments: [{ id: 'dpia-noodzaak', levels: [] }],
        }),
      ),
    ).toBe(true)
    expect(isLeft(dpia.DPIA.decode({ name: 'DPIA' }))).toBe(true)
  })
})

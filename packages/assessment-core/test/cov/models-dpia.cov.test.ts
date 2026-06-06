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
      task: 'Root',
      id: '1',
      type: ['task_group'],
      is_official_id: true,
      valueType: 'string',
      instance_label_template: 'Item {index}',
      description: 'desc',
      category: 'cat',
      repeatable: true,
      tasks: [
        {
          task: 'Child',
          id: '1.1',
          type: ['text_input'],
          options: [{ value: 'a', label: 'A' }, { value: true }, { value: null }],
          sources: [{ source: 'src', description: 'd' }, { source: 'src2' }],
          dependencies: [
            {
              type: 'visibility',
              action: 'show',
              condition: { id: '1.2', operator: 'eq', value: 'x' },
              source: { id: '1.3' },
              mapping_type: 'one-to-one',
            },
            { type: 'enable', action: 'hide' },
          ],
          defaultValue: 'def',
          calculation: {
            expression: 'a + b',
            scoreKey: 'score',
            riskScore: [{ when: 'high', value: 3 }],
          },
          references: {
            prescanModelId: 'pm1',
            DPIA: [{ id: 'r1', type: 'pre-fill' }],
          },
        },
      ],
    }
    const result = dpia.Task.decode(value)
    expect(isRight(result)).toBe(true)
  })

  it('decodes a minimal Task with only required fields', () => {
    const result = dpia.Task.decode({ task: 'T', id: '2', type: ['date'] })
    expect(isRight(result)).toBe(true)
  })

  it('rejects an invalid Task (missing required id)', () => {
    const result = dpia.Task.decode({ task: 'T', type: ['date'] })
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
    const result = dpia.Tasks.decode([{ task: 'T', id: '3', type: ['image'] }])
    expect(isRight(result)).toBe(true)
  })

  it('decodes Source with and without description', () => {
    expect(isRight(dpia.Source.decode({ source: 's' }))).toBe(true)
    expect(isRight(dpia.Source.decode({ source: 's', description: 'd' }))).toBe(true)
  })

  it('decodes Option value union variants', () => {
    expect(isRight(dpia.Option.decode({ value: 'str', label: 'L' }))).toBe(true)
    expect(isRight(dpia.Option.decode({ value: false }))).toBe(true)
    expect(isRight(dpia.Option.decode({ value: null }))).toBe(true)
    expect(isLeft(dpia.Option.decode({ value: 1 }))).toBe(true)
  })

  it('decodes Condition with and without optional value', () => {
    expect(isRight(dpia.Condition.decode({ id: 'c', operator: 'eq' }))).toBe(true)
    expect(isRight(dpia.Condition.decode({ id: 'c', operator: 'eq', value: true }))).toBe(true)
  })

  it('decodes Dependency with full and minimal shape', () => {
    expect(isRight(dpia.Dependency.decode({ type: 't', action: 'a' }))).toBe(true)
    expect(
      isRight(
        dpia.Dependency.decode({
          type: 't',
          action: 'a',
          condition: { id: 'c', operator: 'eq' },
          source: { id: 's' },
          mapping_type: 'm',
        }),
      ),
    ).toBe(true)
  })

  it('decodes RiskScore', () => {
    expect(isRight(dpia.RiskScore.decode({ when: 'w', value: 1 }))).toBe(true)
    expect(isLeft(dpia.RiskScore.decode({ when: 'w' }))).toBe(true)
  })

  it('decodes Calculation full and minimal', () => {
    expect(isRight(dpia.Calculation.decode({ expression: 'e' }))).toBe(true)
    expect(
      isRight(
        dpia.Calculation.decode({
          expression: 'e',
          scoreKey: 'k',
          riskScore: [{ when: 'w', value: 2 }],
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
    expect(isRight(dpia.TaskReference.decode({ id: 'r', type: 'one-to-many' }))).toBe(true)
    expect(isRight(dpia.TaskReferences.decode({}))).toBe(true)
    expect(
      isRight(dpia.TaskReferences.decode({ prescanModelId: 'p', DPIA: [{ id: 'r', type: 'pre-view' }] })),
    ).toBe(true)
  })

  it('decodes Criterion', () => {
    expect(isRight(dpia.Criterion.decode({ id: 'c', expression: 'e', explanation: 'x' }))).toBe(true)
  })

  it('decodes AssessmentLevel full and minimal', () => {
    expect(isRight(dpia.AssessmentLevel.decode({ level: 'l', expression: 'e', result: 'r' }))).toBe(true)
    expect(
      isRight(
        dpia.AssessmentLevel.decode({
          level: 'l',
          expression: 'e',
          result: 'r',
          explanation: 'ex',
          criteria: [{ id: 'c', expression: 'e', explanation: 'x' }],
        }),
      ),
    ).toBe(true)
  })

  it('decodes Assessment', () => {
    expect(
      isRight(
        dpia.Assessment.decode({
          id: 'a',
          levels: [{ level: 'l', expression: 'e', result: 'r' }],
        }),
      ),
    ).toBe(true)
  })

  it('decodes DPIA full and minimal', () => {
    expect(
      isRight(
        dpia.DPIA.decode({
          name: 'n',
          urn: 'u',
          version: 'v',
          description: 'd',
          tasks: [{ task: 'T', id: '1', type: ['task_group'] }],
        }),
      ),
    ).toBe(true)
    expect(
      isRight(
        dpia.DPIA.decode({
          name: 'n',
          urn: 'u',
          version: 'v',
          description: 'd',
          tasks: [],
          assessments: [{ id: 'a', levels: [] }],
        }),
      ),
    ).toBe(true)
    expect(isLeft(dpia.DPIA.decode({ name: 'n' }))).toBe(true)
  })
})

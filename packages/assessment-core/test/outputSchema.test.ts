import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { buildOutputData } from '../src/utils/jsonExport'
import { FormType } from '../src/models/dpia'

// Mock useSchemaStore
vi.mock('../src/stores/schemas', () => ({
  useSchemaStore: vi.fn(() => ({
    getUrn: (ns: string) => ns === 'dpia' ? 'urn:nl:dpia:3.0' : 'urn:nl:prescan:2.0',
  })),
}))

const schemaPath = resolve(__dirname, '../../../schemas/assessment-output.v2.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))

describe('assessment output schema validation', () => {
  let ajv: Ajv2020
  let validate: ReturnType<Ajv2020['compile']>
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeAll(() => {
    ajv = new Ajv2020({ allErrors: true })
    addFormats(ajv)
    validate = ajv.compile(schema)
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  it('empty prescan output validates against schema', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    const output = buildOutputData(taskStore, answerStore)
    const valid = validate(output)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('prescan output with answers validates against schema', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01T00:00:00.000Z' },
      '1.1.1': { value: 'false', lastEditedAt: '2026-01-01T00:00:00.000Z' },
      '3.1': { value: [], lastEditedAt: '2026-01-01T00:00:00.000Z' },
    }
    const output = buildOutputData(taskStore, answerStore)
    const valid = validate(output)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('output with completedTasks validates against schema', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.completedRootTaskIds[FormType.PRE_SCAN] = new Set(['0', '1', '3'])
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01T00:00:00.000Z' },
    }
    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata.completedTasks).toEqual(['0', '1', '3'])
    const valid = validate(output)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('output without completedTasks (no completed sections) validates', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'test', lastEditedAt: '2026-01-01T00:00:00.000Z' },
    }
    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata).not.toHaveProperty('completedTasks')
    const valid = validate(output)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('dpia output with repeatable task answers validates', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '2.1.1': { value: 'ja', lastEditedAt: '2026-01-01T00:00:00.000Z' },
      '2.1.1[0]': { value: 'eerste', lastEditedAt: '2026-01-01T00:00:00.000Z' },
      '2.1.1[1]': { value: 'tweede', lastEditedAt: '2026-01-01T00:00:00.000Z' },
    }
    const output = buildOutputData(taskStore, answerStore)
    const valid = validate(output)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('grouped repeatable output validates against schema', () => {
    const groupedOutput = {
      $schema: schema.$id,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0' },
      answers: {
        '0.1': { value: 'My project', lastEditedAt: '2026-01-01T00:00:00.000Z' },
        '2.1': [
          { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2026-01-01T00:00:00.000Z' }, '2.1.2': { value: 'Employees', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
          { _index: 2, '2.1.1': { value: 'Phone', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
        ],
      },
    }
    const valid = validate(groupedOutput)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('grouped output with empty instance (only _index) validates', () => {
    const outputWithEmpty = {
      $schema: schema.$id,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0' },
      answers: {
        '2.1': [
          { _index: 0 },
          { _index: 1, '2.1.1': { value: 'Phone', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
        ],
      },
    }
    const valid = validate(outputWithEmpty)
    expect(validate.errors).toBeNull()
    expect(valid).toBe(true)
  })

  it('rejects grouped output with missing _index', () => {
    const invalidOutput = {
      $schema: schema.$id,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0' },
      answers: {
        '2.1': [
          { '2.1.1': { value: 'Email', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
        ],
      },
    }
    expect(validate(invalidOutput)).toBe(false)
  })

  it('rejects output with invalid answer key format', () => {
    const invalidOutput = {
      $schema: schema.$id,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0' },
      answers: {
        'invalid key with spaces': { value: 'test', lastEditedAt: '2026-01-01T00:00:00.000Z' },
      },
    }
    expect(validate(invalidOutput)).toBe(false)
  })

  it('rejects output with invalid completedTasks values', () => {
    const invalidOutput = {
      $schema: schema.$id,
      metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0', completedTasks: ['abc', 'not-a-number'] },
      answers: {},
    }
    expect(validate(invalidOutput)).toBe(false)
  })

  it('rejects output with missing required fields', () => {
    expect(validate({ metadata: { createdAt: '2026-01-01T00:00:00.000Z', urn: 'urn:nl:dpia:3.0' } })).toBe(false)
    expect(validate({ $schema: schema.$id, answers: {} })).toBe(false)
  })
})

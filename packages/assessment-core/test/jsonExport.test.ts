import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, type FlatTask } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { buildOutputData } from '../src/utils/jsonExport'
import { OUTPUT_SCHEMA_URL } from '../src/models/assessmentState'
import { FormType } from '../src/models/dpia'

// Mock useSchemaStore — getUrn requires loaded schemas which need full DPIA JSON
vi.mock('../src/stores/schemas', () => ({
  useSchemaStore: vi.fn(() => ({
    getUrn: (ns: string) => ns === 'dpia' ? 'urn:nl:dpia:3.0' : 'urn:nl:prescan:2.0',
  })),
}))

describe('buildOutputData', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  it('produces valid AssessmentOutput with $schema, urn, and answers', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
      '1.1.1': { value: 'false', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(output.metadata.urn).toBe('urn:nl:prescan:2.0')
    expect(output.metadata.createdAt).toBeDefined()
    expect(output.answers['0.1']).toEqual({ value: 'true', lastEditedAt: '2026-01-01' })
    expect(output.answers['1.1.1']).toEqual({ value: 'false', lastEditedAt: '2026-01-01' })
  })

  it('groups repeatable answers under parent key', () => {
    taskStore.setActiveNamespace(FormType.DPIA)

    // Set up flatTasks so groupAnswers knows about repeatable structure
    taskStore.flatTasks[FormType.DPIA] = {
      '0': { id: '0', task: 'Intro', type: ['task_group'], parentId: null, childrenIds: ['0.1'] },
      '0.1': { id: '0.1', task: 'Name', type: ['text'], parentId: '0', childrenIds: [] },
      '2': { id: '2', task: 'Section', type: ['task_group'], parentId: null, childrenIds: ['2.1'] },
      '2.1': {
        id: '2.1', task: 'Repeatable', type: ['task_group'], repeatable: true,
        parentId: '2', childrenIds: ['2.1.1', '2.1.2'],
      },
      '2.1.1': { id: '2.1.1', task: 'Field A', type: ['text'], parentId: '2.1', childrenIds: [] },
      '2.1.2': { id: '2.1.2', task: 'Field B', type: ['text'], parentId: '2.1', childrenIds: [] },
    } as Record<string, FlatTask>

    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'My project', lastEditedAt: '2026-01-01' },
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2026-01-01' },
      '2.1.2[0]': { value: 'Employees', lastEditedAt: '2026-01-01' },
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2026-01-01' },
      '2.1.2[1]': { value: 'Customers', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    // Non-repeatable passes through
    expect(output.answers['0.1']).toEqual({ value: 'My project', lastEditedAt: '2026-01-01' })

    // Repeatable children are grouped
    const grouped = output.answers['2.1']
    expect(Array.isArray(grouped)).toBe(true)
    const arr = grouped as any[]
    expect(arr).toHaveLength(2)
    expect(arr[0]._index).toBe(0)
    expect(arr[0]['2.1.1']).toEqual({ value: 'Email', lastEditedAt: '2026-01-01' })
    expect(arr[1]._index).toBe(1)
    expect(arr[1]['2.1.1']).toEqual({ value: 'Phone', lastEditedAt: '2026-01-01' })

    // Instance keys NOT in output
    expect(output.answers['2.1.1[0]']).toBeUndefined()
  })

  it('includes completedTasks when sections are marked complete', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.completedRootTaskIds[FormType.PRE_SCAN] = new Set(['0', '1', '5'])
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata.completedTasks).toEqual(['0', '1', '5'])
  })

  it('sorts completedTasks numerically', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['5', '1', '10', '0'])

    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata.completedTasks).toEqual(['0', '1', '5', '10'])
  })

  it('omits completedTasks when no sections are complete', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'test', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata).not.toHaveProperty('completedTasks')
  })

  it('uses active namespace for answers and URN', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '2.1.1': { value: 'ja', lastEditedAt: '2026-01-01' },
    }
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(output.answers).toHaveProperty('2.1.1')
    expect(output.answers).not.toHaveProperty('0.1')
  })

  it('round-trips correctly: export → detect → normalize → apply preserves data', async () => {
    const { detectImportType, normalizeToState } = await import('../src/utils/importDetect')
    const { applyStateToStores } = await import('../src/utils/applyState')

    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.completedRootTaskIds[FormType.PRE_SCAN] = new Set(['0', '1', '3'])
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
      '0.2': { value: 'beschrijving', lastEditedAt: '2026-01-01' },
      '1.1.1': { value: 'false', lastEditedAt: '2026-01-01' },
      '3.1': { value: [], lastEditedAt: '2026-01-01' },
    }

    const exported = buildOutputData(taskStore, answerStore)

    // Simulate fresh stores
    setActivePinia(createPinia())
    const freshTaskStore = useTaskStore()
    const freshAnswerStore = useAnswerStore()
    freshTaskStore.setActiveNamespace(FormType.PRE_SCAN)
    freshAnswerStore.setActiveNamespace(FormType.PRE_SCAN)

    const type = detectImportType(exported as unknown as Record<string, unknown>)
    expect(type).toBe('prescan')

    const state = normalizeToState(exported as unknown as Record<string, unknown>, type!)
    applyStateToStores(state, freshTaskStore, freshAnswerStore)

    expect(Object.keys(freshAnswerStore.answers.prescan)).toHaveLength(4)
    expect(freshAnswerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2026-01-01' })
    expect(freshTaskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3']))
  })
})

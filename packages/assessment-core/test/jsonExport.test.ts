import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
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

  it('produces valid AssessmentOutput with $schema, urn, and flat answers', () => {
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
    // Pre-scan answers should be ignored
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

    // Set up source state
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.completedRootTaskIds[FormType.PRE_SCAN] = new Set(['0', '1', '3'])
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
      '0.2': { value: 'beschrijving', lastEditedAt: '2026-01-01' },
      '1.1.1': { value: 'false', lastEditedAt: '2026-01-01' },
      '3.1': { value: [], lastEditedAt: '2026-01-01' },
    }

    // Export
    const exported = buildOutputData(taskStore, answerStore)

    // Simulate fresh stores (like a new browser session)
    setActivePinia(createPinia())
    const freshTaskStore = useTaskStore()
    const freshAnswerStore = useAnswerStore()

    // Import
    const type = detectImportType(exported as unknown as Record<string, unknown>)
    expect(type).toBe('prescan')

    const state = normalizeToState(exported as unknown as Record<string, unknown>, type!)
    applyStateToStores(state, freshTaskStore, freshAnswerStore)

    // Verify answers preserved
    expect(Object.keys(freshAnswerStore.answers.prescan)).toHaveLength(4)
    expect(freshAnswerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2026-01-01' })

    // Verify completedTasks preserved (from explicit completedTasks, not derived)
    expect(freshTaskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3']))
  })
})

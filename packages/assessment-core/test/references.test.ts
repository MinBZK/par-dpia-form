import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { useReferences } from '../src/composables/useReferences'
import { usePreScanReferences } from '../src/composables/usePreScanReferences'
import { FormType, type Task } from '../src/models/dpia'

/**
 * Routing tests for the unified `useReferences` composable. These assert the
 * self-vs-cross scope and prefill-vs-preview type routing — not exhaustive
 * data handling. Stores are seeded directly per namespace via init() + answers.
 */
describe('useReferences — reference routing', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    useSchemaStore()
  })

  // Initialize a namespace with a flat list of (non-repeatable) tasks. init()
  // creates one default instance per task with instanceId === taskId.
  const initNamespace = (namespace: FormType, tasks: Task[]) => {
    taskStore.setActiveNamespace(namespace)
    answerStore.setActiveNamespace(namespace)
    taskStore.init(tasks as Task[], true)
  }

  const seedAnswer = (namespace: FormType, instanceId: string, value: string) => {
    answerStore.setActiveNamespace(namespace)
    answerStore.setAnswer(instanceId, value)
  }

  it('cross prefill: resolves a pre-scan pre-fill reference into the DPIA target value', () => {
    // Pre-scan source task that pre-fills DPIA task 1.1.
    initNamespace(FormType.PRE_SCAN, [
      {
        id: 'p1.1',
        task: 'Pre-scan source',
        type: ['text_input'],
        references: { DPIA: [{ id: '1.1', type: 'pre-fill' }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.PRE_SCAN, 'p1.1', 'Verwerkt persoonsgegevens')

    // DPIA target form.
    initNamespace(FormType.DPIA, [
      { id: '1.1', task: 'DPIA target', type: ['text_input'] },
    ] as unknown as Task[])

    // Active form must be DPIA for the reference key to resolve to DPIA refs.
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const { findReferences, getPrefillValueForTask } = useReferences()
    const dpiaTask = taskStore.getTasksFromNamespace(FormType.DPIA)['1.1']

    const matches = findReferences('1.1')
    expect(matches).toHaveLength(1)
    expect(matches[0].scope).toBe('cross')
    expect(matches[0].sourceNamespace).toBe(FormType.PRE_SCAN)

    expect(getPrefillValueForTask(dpiaTask)).toBe('Verwerkt persoonsgegevens')

    // The shim must produce the same prefill value for the cross case.
    const { getPreScanValueForTask } = usePreScanReferences()
    expect(getPreScanValueForTask(dpiaTask)).toBe('Verwerkt persoonsgegevens')
  })

  it('cross prefill: converts string booleans to real booleans', () => {
    initNamespace(FormType.PRE_SCAN, [
      {
        id: 'p2.1',
        task: 'Pre-scan boolean source',
        type: ['radio_option'],
        references: { DPIA: [{ id: '2.1', type: 'pre-fill' }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.PRE_SCAN, 'p2.1', 'true')

    initNamespace(FormType.DPIA, [
      { id: '2.1', task: 'DPIA boolean target', type: ['radio_option'] },
    ] as unknown as Task[])

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const { getPrefillValueForTask } = useReferences()
    const dpiaTask = taskStore.getTasksFromNamespace(FormType.DPIA)['2.1']
    expect(getPrefillValueForTask(dpiaTask)).toBe(true)
  })

  it('self suggestion: surfaces a same-form pre-view reference and excludes prefill types', () => {
    // DPIA form with a source task (3.2) that has a pre-view reference to 3.1,
    // and another source task (3.3) with a pre-fill reference to 3.1.
    initNamespace(FormType.DPIA, [
      { id: '3.1', task: 'DPIA suggestion target', type: ['text_input'] },
      {
        id: '3.2',
        task: 'DPIA preview source',
        type: ['text_input'],
        references: { DPIA: [{ id: '3.1', type: 'pre-view' }] },
      },
      {
        id: '3.3',
        task: 'DPIA prefill source',
        type: ['text_input'],
        references: { DPIA: [{ id: '3.1', type: 'pre-fill' }] },
      },
    ] as unknown as Task[])

    seedAnswer(FormType.DPIA, '3.2', 'Eerder ingevuld antwoord')
    seedAnswer(FormType.DPIA, '3.3', 'Prefill antwoord')

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const { getSuggestionsForTask } = useReferences()
    const target = taskStore.getTasksFromNamespace(FormType.DPIA)['3.1']

    const suggestions = getSuggestionsForTask(target)
    // Only the pre-view (non-prefill) self-reference is offered as a suggestion.
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].sourceTaskId).toBe('3.2')
    expect(suggestions[0].answer).toBe('Eerder ingevuld antwoord')
    // Prefill source (3.3) must NOT appear among suggestions.
    expect(suggestions.some((s) => s.sourceTaskId === '3.3')).toBe(false)
  })
})

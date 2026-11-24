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

  it('self suggestion: deduplicates multiple references from the same source task', () => {
    // Source task 4.2 has TWO pre-view references to target 4.1; the suggestion
    // list must contain that source only once (seen.has dedup branch).
    initNamespace(FormType.DPIA, [
      { id: '4.1', task: 'DPIA suggestion target', type: ['text_input'] },
      {
        id: '4.2',
        task: 'DPIA dubbele bron',
        type: ['text_input'],
        references: {
          DPIA: [
            { id: '4.1', type: 'pre-view' },
            { id: '4.1', type: 'pre-view' },
          ],
        },
      },
    ] as unknown as Task[])

    seedAnswer(FormType.DPIA, '4.2', 'Antwoord een keer')

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const { getSuggestionsForTask } = useReferences()
    const target = taskStore.getTasksFromNamespace(FormType.DPIA)['4.1']

    const suggestions = getSuggestionsForTask(target)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].sourceTaskId).toBe('4.2')
  })

  // Seed a DPIA source task that points at IAMA task 1.1 with the given
  // reference type, and make the IAMA the active form.
  const seedCrossReference = (type: string) => {
    initNamespace(FormType.DPIA, [
      {
        id: '5.1',
        task: 'DPIA bron',
        type: ['open_text'],
        references: { IAMA: [{ id: '1.1', type }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.DPIA, '5.1', 'Antwoord uit de DPIA')

    initNamespace(FormType.IAMA, [
      { id: '1.1', task: 'IAMA doel', type: ['open_text'] },
    ] as unknown as Task[])

    taskStore.setActiveNamespace(FormType.IAMA)
    answerStore.setActiveNamespace(FormType.IAMA)
    return taskStore.getTasksFromNamespace(FormType.IAMA)['1.1']
  }

  it('cross suggestion: offers the answer of a suggestion reference from another form', () => {
    const target = seedCrossReference('suggestion')

    const { getSuggestionsForTask, getPrefillValueForTask, getPreviewDataForSection } =
      useReferences()

    const suggestions = getSuggestionsForTask(target)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      sourceNamespace: FormType.DPIA,
      scope: 'cross',
      sourceTaskId: '5.1',
      sourceTaskTitle: 'DPIA bron',
      sourceIsText: true,
      answer: 'Antwoord uit de DPIA',
    })
    // A suggestion is only offered: it neither fills the field nor shows in the
    // section preview.
    expect(getPrefillValueForTask(target)).toBeNull()
    expect(getPreviewDataForSection('1')).toEqual([])
  })

  it('cross suggestion: a pre-view reference from another form stays a preview only', () => {
    const target = seedCrossReference('pre-view')

    const { getSuggestionsForTask, getPreviewDataForSection } = useReferences()

    expect(getSuggestionsForTask(target)).toEqual([])
    expect(getPreviewDataForSection('1')).toHaveLength(1)
  })

  it('cross suggestion: the title of the source question is shown without definition markup', () => {
    initNamespace(FormType.DPIA, [
      {
        id: '5.1',
        task: 'Beschrijf de <span class="aiv-definition">verwerking<span class="aiv-definition-text">Uitleg</span></span>',
        type: ['open_text'],
        references: { IAMA: [{ id: '1.1', type: 'suggestion' }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.DPIA, '5.1', 'Antwoord')
    initNamespace(FormType.IAMA, [
      { id: '1.1', task: 'IAMA doel', type: ['open_text'] },
    ] as unknown as Task[])
    taskStore.setActiveNamespace(FormType.IAMA)
    answerStore.setActiveNamespace(FormType.IAMA)

    const { getSuggestionsForTask } = useReferences()
    const target = taskStore.getTasksFromNamespace(FormType.IAMA)['1.1']

    expect(getSuggestionsForTask(target)[0].sourceTaskTitle).toBe('Beschrijf de verwerking')
  })

  it('cross suggestion: the same question number in two forms gives two suggestions', () => {
    // Source 1.2 exists in the IAMA itself (self pre-view) and in the DPIA
    // (cross suggestion); both point at IAMA 1.1 and both must be listed.
    initNamespace(FormType.DPIA, [
      {
        id: '1.2',
        task: 'DPIA bron',
        type: ['open_text'],
        references: { IAMA: [{ id: '1.1', type: 'suggestion' }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.DPIA, '1.2', 'Uit de DPIA')
    initNamespace(FormType.IAMA, [
      { id: '1.1', task: 'IAMA doel', type: ['open_text'] },
      {
        id: '1.2',
        task: 'IAMA bron',
        type: ['open_text'],
        references: { IAMA: [{ id: '1.1', type: 'pre-view' }] },
      },
    ] as unknown as Task[])
    seedAnswer(FormType.IAMA, '1.2', 'Uit het IAMA')
    taskStore.setActiveNamespace(FormType.IAMA)
    answerStore.setActiveNamespace(FormType.IAMA)

    const { getSuggestionsForTask } = useReferences()
    const target = taskStore.getTasksFromNamespace(FormType.IAMA)['1.1']

    expect(getSuggestionsForTask(target).map((s) => [s.sourceNamespace, s.answer])).toEqual([
      [FormType.DPIA, 'Uit de DPIA'],
      [FormType.IAMA, 'Uit het IAMA'],
    ])
  })
})

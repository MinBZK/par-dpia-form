import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReferenceSuggestions from '../../src/components/ReferenceSuggestions.vue'
import { useTaskStore, type FlatTask } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useSchemaStore } from '../../src/stores/schemas'
import { FormType, type Task } from '../../src/models/dpia'

let taskStore: ReturnType<typeof useTaskStore>
let answerStore: ReturnType<typeof useAnswerStore>

beforeEach(() => {
  setActivePinia(createPinia())
  taskStore = useTaskStore()
  answerStore = useAnswerStore()
  useSchemaStore()
  taskStore.setActiveNamespace(FormType.DPIA)
  answerStore.setActiveNamespace(FormType.DPIA)
})

// Seed a DPIA form whose source task (3.2) has a self pre-view reference to the
// target task (3.1), then return the target FlatTask the component renders for.
function seedSuggestionForTarget(sourceAnswer: unknown): FlatTask {
  taskStore.init(
    [
      { id: '3.1', task: 'Doel', type: ['text_input'] },
      {
        id: '3.2',
        task: 'Bron',
        type: ['text_input'],
        references: { DPIA: [{ id: '3.1', type: 'pre-view' }] },
      },
    ] as unknown as Task[],
    true,
  )
  answerStore.setAnswer('3.2', sourceAnswer as never)
  return taskStore.getTasksFromNamespace(FormType.DPIA)['3.1']
}

function mountFor(task: FlatTask) {
  return mount(ReferenceSuggestions, { props: { task } })
}

describe('ReferenceSuggestions.vue', () => {
  it('renders nothing when there are no suggestions for the task', () => {
    taskStore.init([{ id: '1.1', task: 'Solo', type: ['text_input'] }] as unknown as Task[], true)
    const task = taskStore.getTasksFromNamespace(FormType.DPIA)['1.1']

    const wrapper = mountFor(task)
    expect(wrapper.find('.rvo-alert').exists()).toBe(false)
  })

  it('renders a suggestion alert with the source task id, title and answer', () => {
    const target = seedSuggestionForTarget('Eerder antwoord')

    const wrapper = mountFor(target)
    const alert = wrapper.find('.rvo-alert--warning')
    expect(alert.exists()).toBe(true)
    expect(wrapper.text()).toContain('Suggestie uit antwoord op vraag 3.2 – Bron')
    expect(wrapper.text()).toContain('Eerder antwoord')
  })

  it('formats an array answer as a comma-separated string', () => {
    const target = seedSuggestionForTarget(['Optie A', 'Optie B'])

    const wrapper = mountFor(target)
    expect(wrapper.text()).toContain('Optie A, Optie B')
  })

  it('formats the string "true" as "Ja"', () => {
    const target = seedSuggestionForTarget('true')

    const wrapper = mountFor(target)
    expect(wrapper.text()).toContain('Ja')
  })

  it('formats the string "false" as "Nee"', () => {
    const target = seedSuggestionForTarget('false')

    const wrapper = mountFor(target)
    expect(wrapper.text()).toContain('Nee')
  })

  it('formats a non-string, non-array answer (image object) as an empty string', () => {
    // An ImageValue object is neither array nor string -> formatAnswer returns ''.
    const target = seedSuggestionForTarget({ data: 'data:image/png;base64,AAA', title: 'foto' })

    const wrapper = mountFor(target)
    // The alert still renders (there is a suggestion), but the answer line is empty.
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(true)
    const paragraphs = wrapper.findAll('.rvo-alert-text p')
    expect(paragraphs[1].text()).toBe('')
  })
})

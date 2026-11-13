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

function mountFor(task: FlatTask, instanceId = '3.1') {
  return mount(ReferenceSuggestions, { props: { task, instanceId } })
}

// Same as seedSuggestionForTarget, but with a configurable target type.
function seedTarget(targetType: string, sourceAnswer: unknown): FlatTask {
  taskStore.init(
    [
      { id: '3.1', task: 'Doel', type: [targetType] },
      {
        id: '3.2',
        task: 'Bron',
        type: ['open_text'],
        references: { DPIA: [{ id: '3.1', type: 'pre-view' }] },
      },
    ] as unknown as Task[],
    true,
  )
  answerStore.setAnswer('3.2', sourceAnswer as never)
  return taskStore.getTasksFromNamespace(FormType.DPIA)['3.1']
}

const adoptButton = (wrapper: ReturnType<typeof mountFor>) =>
  wrapper.findAll('button').find((b) => b.text() === 'Neem antwoord over')

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

  describe('Neem antwoord over', () => {
    it('fills an empty open_text field with the suggested answer', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eerder antwoord')
    })

    it('appends to existing open_text content after a blank line', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eigen tekst')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eigen tekst\n\nEerder antwoord')
    })

    it('treats a whitespace-only field as empty', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', '  \n')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eerder antwoord')
    })

    it('hides the button once the answer is already in the field', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('keeps the button when the suggestion only occurs inside another word', () => {
      const target = seedTarget('open_text', 'Ja')
      answerStore.setAnswer('3.1', 'Jaarlijks overleg')

      expect(adoptButton(mountFor(target, '3.1'))).toBeDefined()
    })

    it('hides the button when the suggestion is the first block of the field', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eerder antwoord\n\nEigen tekst')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('hides the button when the suggestion is a middle block of the field', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Begin\n\nEerder antwoord\n\nEind')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('adds only the missing part of the blank line after existing text', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eigen tekst\n')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eigen tekst\n\nEerder antwoord')
    })

    it('names the source question in the accessible name of the button', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')

      const button = adoptButton(mountFor(target, '3.1'))!
      expect(button.attributes('aria-label')).toBe('Neem antwoord over van vraag 3.2')
    })

    it('trims surrounding whitespace of the suggestion and hides the button afterwards', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord\n')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eerder antwoord')
      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('shows no button for a whitespace-only suggestion', () => {
      const target = seedTarget('open_text', '  \n ')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('normalises CRLF line endings so an adopted answer stays recognised', async () => {
      const target = seedTarget('open_text', 'Regel 1\r\nRegel 2')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Regel 1\nRegel 2')
      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('emits adopted so the field can take focus', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(wrapper.emitted('adopted')).toHaveLength(1)
    })

    it('keeps trailing spaces of the existing text (markdown hard break)', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'regel één  ')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('regel één  \n\nEerder antwoord')
    })

    it('adds no extra blank line when the existing text already ends with one', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eigen tekst\n\n')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eigen tekst\n\nEerder antwoord')
    })

    it('recognises an adopted paragraph in text with CRLF line endings', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Intro\r\n\r\nEerder antwoord')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('recognises an adopted paragraph after a blank line holding spaces', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', '\nFoo\n \nEerder antwoord')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('shows no button when the stored answer is not text', () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', ['Optie A'])

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('keeps markdown indentation after a blank line in the adopted answer', async () => {
      const target = seedTarget('open_text', '1. Eerste\n\n   Toelichting\n\n- a\n\n  - sub')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('1. Eerste\n\n   Toelichting\n\n- a\n\n  - sub')
      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('drops leading blank lines of the suggestion', async () => {
      const target = seedTarget('open_text', '\n  \nEerder antwoord')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eerder antwoord')
    })

    it('adopts the source text as written, not its display form', async () => {
      const target = seedTarget('open_text', 'true')

      const wrapper = mountFor(target, '3.1')
      expect(wrapper.text()).toContain('Ja')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('true')
      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('keeps repeated blank lines inside the adopted text', async () => {
      const target = seedTarget('open_text', '```\na\n\n\nb\n```')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('```\na\n\n\nb\n```')
      expect(adoptButton(wrapper)).toBeUndefined()
    })

    it('adds exactly one blank line after existing text ending in a CRLF blank line', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eigen tekst\r\n\r\n')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eigen tekst\n\nEerder antwoord')
    })

    it('replaces trailing whitespace-only lines by a single blank line', async () => {
      const target = seedTarget('open_text', 'Eerder antwoord')
      answerStore.setAnswer('3.1', 'Eigen\n\n \t')

      const wrapper = mountFor(target, '3.1')
      await adoptButton(wrapper)!.trigger('click')

      expect(answerStore.getAnswer('3.1')).toBe('Eigen\n\nEerder antwoord')
    })

    it('shows no button when the target is not a textarea', () => {
      const target = seedTarget('text_input', 'Eerder antwoord')

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })

    it('shows no button when the suggestion has no text', () => {
      const target = seedTarget('open_text', { data: 'data:image/png;base64,AAA', title: 'foto' })

      expect(adoptButton(mountFor(target, '3.1'))).toBeUndefined()
    })
  })
})

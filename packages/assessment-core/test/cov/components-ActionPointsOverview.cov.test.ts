import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ActionPointsOverview from '../../src/components/ActionPointsOverview.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'

let taskStore: ReturnType<typeof useTaskStore>
let answerStore: ReturnType<typeof useAnswerStore>

beforeEach(() => {
  setActivePinia(createPinia())
  taskStore = useTaskStore()
  answerStore = useAnswerStore()
  taskStore.setActiveNamespace(FormType.IAMA)
  answerStore.setActiveNamespace(FormType.IAMA)
})

function initTasks(tasks: Task[]) {
  taskStore.init(tasks as Task[], true)
}

function mountOverview() {
  return mount(ActionPointsOverview)
}

describe('ActionPointsOverview.vue', () => {
  it('renders the empty-state message when there are no action_point_group tasks at all', () => {
    initTasks([
      { id: '1', task: 'Deel 1', type: ['task_group'], tasks: [] },
    ] as unknown as Task[])

    const wrapper = mountOverview()
    expect(wrapper.text()).toContain('Overzicht actiepunten')
    expect(wrapper.text()).toContain('Er zijn nog geen actiepunten ingevuld in de voorgaande delen.')
    expect(wrapper.find('h3').exists()).toBe(false)
  })

  it('renders the empty-state message when action groups exist but have no filled-in answers', () => {
    initTasks([
      {
        id: '1',
        task: 'Deel 1',
        type: ['task_group'],
        tasks: [
          {
            id: '1.actiepunten',
            task: 'Actiepunten',
            type: ['task_group'],
            action_point_group: true,
            tasks: [{ id: '1.actiepunten.1', task: 'Actiepunt', type: ['text_input'] }],
          },
        ],
      },
    ] as unknown as Task[])

    // No answer set for 1.actiepunten.1 -> getAnswer returns falsy -> filtered out.
    const wrapper = mountOverview()
    expect(wrapper.text()).toContain('Er zijn nog geen actiepunten ingevuld in de voorgaande delen.')
  })

  it('groups filled-in action points under the parent deel label and lists them', () => {
    initTasks([
      {
        id: '1',
        task: 'Eerste deel',
        type: ['task_group'],
        tasks: [
          {
            id: '1.actiepunten',
            task: 'Actiepunten deel 1',
            type: ['task_group'],
            action_point_group: true,
            tasks: [
              { id: '1.actiepunten.1', task: 'A', type: ['text_input'] },
              { id: '1.actiepunten.2', task: 'B', type: ['text_input'] },
            ],
          },
        ],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('1.actiepunten.1', '  Eerste actiepunt  ')
    answerStore.setAnswer('1.actiepunten.2', 'Tweede actiepunt')

    const wrapper = mountOverview()
    // Deel label resolved from task '1'.
    const heading = wrapper.find('h3')
    expect(heading.text()).toBe('Eerste deel')

    const items = wrapper.findAll('.utrecht-unordered-list__item')
    expect(items).toHaveLength(2)
    // Values are trimmed.
    expect(items[0].text()).toBe('Eerste actiepunt')
    expect(items[1].text()).toBe('Tweede actiepunt')
  })

  it('skips non-string and whitespace-only answers but keeps the valid ones', () => {
    initTasks([
      {
        id: '1',
        task: 'Deel 1',
        type: ['task_group'],
        tasks: [
          {
            id: '1.actiepunten',
            task: 'Actiepunten',
            type: ['task_group'],
            action_point_group: true,
            tasks: [
              { id: '1.actiepunten.1', task: 'Leeg', type: ['text_input'] },
              { id: '1.actiepunten.2', task: 'Geldig', type: ['text_input'] },
              { id: '1.actiepunten.3', task: 'Array', type: ['checkbox'] },
            ],
          },
        ],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('1.actiepunten.1', '   ') // whitespace -> skipped
    answerStore.setAnswer('1.actiepunten.2', 'Bewaar mij')
    answerStore.setAnswer('1.actiepunten.3', ['x', 'y']) // non-string -> skipped

    const wrapper = mountOverview()
    const items = wrapper.findAll('.utrecht-unordered-list__item')
    expect(items).toHaveLength(1)
    expect(items[0].text()).toBe('Bewaar mij')
  })

  it('falls back to "Deel <n>" when the parent deel task cannot be resolved (taskById throws)', () => {
    // The action group id "9.actiepunten" yields deelNummer "9", but there is no
    // task "9" -> taskById throws -> catch branch sets "Deel 9".
    initTasks([
      {
        id: '1',
        task: 'Bestaand deel',
        type: ['task_group'],
        tasks: [
          {
            id: '9.actiepunten',
            task: 'Wees-actiepunten',
            type: ['task_group'],
            action_point_group: true,
            tasks: [{ id: '9.actiepunten.1', task: 'A', type: ['text_input'] }],
          },
        ],
      },
    ] as unknown as Task[])

    answerStore.setAnswer('9.actiepunten.1', 'Een actiepunt')

    const wrapper = mountOverview()
    expect(wrapper.find('h3').text()).toBe('Deel 9')
  })

  it('hides a group section whose items are empty while showing another group that has items', () => {
    initTasks([
      {
        id: '1',
        task: 'Deel 1',
        type: ['task_group'],
        tasks: [
          {
            id: '1.actiepunten',
            task: 'Actiepunten 1',
            type: ['task_group'],
            action_point_group: true,
            tasks: [{ id: '1.actiepunten.1', task: 'A', type: ['text_input'] }],
          },
        ],
      },
      {
        id: '2',
        task: 'Deel 2',
        type: ['task_group'],
        tasks: [
          {
            id: '2.actiepunten',
            task: 'Actiepunten 2',
            type: ['task_group'],
            action_point_group: true,
            tasks: [{ id: '2.actiepunten.1', task: 'B', type: ['text_input'] }],
          },
        ],
      },
    ] as unknown as Task[])

    // Only deel 2 has a filled-in action point.
    answerStore.setAnswer('2.actiepunten.1', 'Actiepunt deel 2')

    const wrapper = mountOverview()
    const headings = wrapper.findAll('h3')
    // Deel 1 group has no items -> its inner template (v-if items.length>0) is hidden.
    expect(headings).toHaveLength(1)
    expect(headings[0].text()).toBe('Deel 2')
  })
})

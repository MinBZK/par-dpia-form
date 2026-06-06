import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import TaskSection from '../../src/components/task/TaskSection.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'

// Real Pinia stores are used (not mocked) so the task-dependency composables
// resolve against genuine task trees / answers.
const STUBS = {
  TaskItem: {
    name: 'TaskItem',
    props: ['taskId', 'instanceId', 'showDescription'],
    template: '<div class="stub-task-item" :data-task-id="taskId" :data-instance-id="instanceId" />',
  },
  TaskGroup: {
    name: 'TaskGroup',
    props: ['taskId', 'instanceId'],
    template: '<div class="stub-task-group" :data-task-id="taskId" :data-instance-id="instanceId" />',
  },
  Results: {
    name: 'Results',
    template: '<div class="stub-results" />',
  },
  PreScanPreview: {
    name: 'PreScanPreview',
    props: ['dpiaTaskId'],
    template: '<div class="stub-prescan-preview" :data-dpia-task-id="dpiaTaskId" />',
  },
  UiButton: {
    name: 'UiButton',
    props: ['variant', 'icon', 'label'],
    emits: ['click'],
    template: '<button class="stub-ui-button" @click="$emit(\'click\')">{{ label }}</button>',
  },
}

function mountSection(taskId: string) {
  return mount(TaskSection, {
    props: { taskId },
    global: { stubs: STUBS },
  })
}

let taskStore: ReturnType<typeof useTaskStore>
let answerStore: ReturnType<typeof useAnswerStore>

beforeEach(() => {
  setActivePinia(createPinia())
  taskStore = useTaskStore()
  answerStore = useAnswerStore()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TaskSection signing task', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
  })

  it('renders signing description and Results when prescan signing task has a description', () => {
    const tasks: Task[] = [
      {
        id: '0',
        task: 'Ondertekening',
        type: ['signing'],
        is_official_id: true,
        description: '<strong>Onderteken hier</strong>',
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('0')

    expect(wrapper.find('h1').text()).toBe('Ondertekening')
    expect(wrapper.html()).toContain('<strong>Onderteken hier</strong>')
    expect(wrapper.findComponent({ name: 'Results' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(false)
  })

  it('renders no description fieldset and no Results when signing task lacks description in DPIA', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const tasks: Task[] = [
      {
        id: '0',
        task: 'Ondertekening',
        type: ['signing'],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('0')

    expect(wrapper.find('h1').text()).toBe('Ondertekening')
    expect(wrapper.find('.utrecht-paragraph').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'Results' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(false)
  })
})

describe('TaskSection taskDisplayTitle', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('prefixes the id when the task has an official id and is not a signing task', () => {
    const tasks: Task[] = [
      {
        id: '3',
        task: 'Gegevensverwerking',
        type: ['text_input'],
        is_official_id: true,
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('3')
    expect(wrapper.find('h1').text()).toBe('3. Gegevensverwerking')
  })

  it('omits the id prefix when the task has no official id', () => {
    const tasks: Task[] = [
      {
        id: '4',
        task: 'Inleiding',
        type: ['text_input'],
        is_official_id: false,
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('4')
    expect(wrapper.find('h1').text()).toBe('Inleiding')
  })
})

describe('TaskSection hasPreScanReferences / PreScanPreview', () => {
  it('shows PreScanPreview in DPIA when a prescan task references DPIA', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    const prescanTasks: Task[] = [
      {
        id: '1',
        task: 'Pre-scan vraag',
        type: ['text_input'],
        references: { DPIA: [{ id: '1', type: 'pre-view' }] },
      },
    ]
    taskStore.init(prescanTasks, true)

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    const dpiaTasks: Task[] = [
      {
        id: '1',
        task: 'DPIA sectie',
        type: ['text_input'],
        is_official_id: true,
      },
    ]
    taskStore.init(dpiaTasks, true)

    const wrapper = mountSection('1')
    const preview = wrapper.findComponent({ name: 'PreScanPreview' })
    expect(preview.exists()).toBe(true)
    expect(preview.props('dpiaTaskId')).toBe('1')
  })

  it('hides PreScanPreview when a prescan task has no DPIA references', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    const prescanTasks: Task[] = [
      {
        id: '1',
        task: 'Pre-scan vraag',
        type: ['text_input'],
      },
    ]
    taskStore.init(prescanTasks, true)

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    const dpiaTasks: Task[] = [
      { id: '1', task: 'DPIA sectie', type: ['text_input'], is_official_id: true },
    ]
    taskStore.init(dpiaTasks, true)

    const wrapper = mountSection('1')
    expect(wrapper.findComponent({ name: 'PreScanPreview' }).exists()).toBe(false)
  })

  it('hides PreScanPreview when the active namespace is not DPIA', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    const prescanTasks: Task[] = [
      { id: '1', task: 'Pre-scan vraag', type: ['text_input'] },
    ]
    taskStore.init(prescanTasks, true)

    const wrapper = mountSection('1')
    expect(wrapper.findComponent({ name: 'PreScanPreview' }).exists()).toBe(false)
  })

  it('hides PreScanPreview for a signing task in DPIA even when prescan references DPIA', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    const prescanTasks: Task[] = [
      {
        id: '1',
        task: 'Pre-scan vraag',
        type: ['text_input'],
        references: { DPIA: [{ id: '1', type: 'pre-view' }] },
      },
    ]
    taskStore.init(prescanTasks, true)

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    const dpiaTasks: Task[] = [
      { id: '1', task: 'Ondertekening', type: ['signing'] },
    ]
    taskStore.init(dpiaTasks, true)

    const wrapper = mountSection('1')
    expect(wrapper.findComponent({ name: 'PreScanPreview' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'Results' }).exists()).toBe(false)
  })
})

describe('TaskSection description with image sources', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('renders the mapped image when a source matches the imageMap key', () => {
    const tasks: Task[] = [
      {
        id: '5',
        task: 'Risico matrix',
        type: ['text_input'],
        is_official_id: true,
        description: '<p>Bekijk de matrix</p>',
        sources: [{ source: 'risico_matrix.png', description: 'De risicomatrix' }],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('5')
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toBe('De risicomatrix')
    expect(img.attributes('src')).toBeTruthy()
  })

  it('renders no image when a source is not in the imageMap', () => {
    const tasks: Task[] = [
      {
        id: '5',
        task: 'Sectie zonder plaatje',
        type: ['text_input'],
        is_official_id: true,
        description: '<p>Tekst</p>',
        sources: [{ source: 'onbekend.png', description: 'Niet bestaand' }],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('5')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.html()).toContain('Tekst')
  })

  it('renders description without sources block when task has no sources', () => {
    const tasks: Task[] = [
      {
        id: '5',
        task: 'Sectie',
        type: ['text_input'],
        is_official_id: true,
        description: '<p>Alleen tekst</p>',
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('5')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.html()).toContain('Alleen tekst')
  })
})

describe('TaskSection task groups with children', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('renders a leaf child as TaskItem (childrenIds empty)', () => {
    const tasks: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '2.1', task: 'Veld', type: ['text_input'] }],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('2')
    const items = wrapper.findAllComponents({ name: 'TaskItem' })
    expect(items).toHaveLength(1)
    expect(items[0].props('taskId')).toBe('2.1')
    expect(items[0].props('showDescription')).toBe(true)
    expect(wrapper.findComponent({ name: 'TaskGroup' }).exists()).toBe(false)
  })

  it('renders a nested group child as TaskGroup (child has children)', () => {
    const tasks: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '2.1',
            task: 'Subgroep',
            type: ['task_group'],
            tasks: [{ id: '2.1.1', task: 'Veld', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('2')
    const groups = wrapper.findAllComponents({ name: 'TaskGroup' })
    expect(groups).toHaveLength(1)
    expect(groups[0].props('taskId')).toBe('2.1')
  })

  it('renders no children for a task_group with no children (shouldShowChildren false)', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Lege groep',
        type: ['task_group'],
        is_official_id: true,
      },
    ]
    taskStore.init(tasks, true)

    // A task_group with zero children does not satisfy shouldShowChildren and
    // is not a non-group leaf, so neither TaskItem nor TaskGroup is rendered.
    const wrapper = mountSection('6')
    expect(wrapper.findAllComponents({ name: 'TaskItem' })).toHaveLength(0)
    expect(wrapper.findAllComponents({ name: 'TaskGroup' })).toHaveLength(0)
  })

  it('renders the single-task TaskItem branch for a non-group task', () => {
    const tasks: Task[] = [
      {
        id: '7',
        task: 'Enkel veld',
        type: ['text_input'],
        is_official_id: true,
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('7')
    const items = wrapper.findAllComponents({ name: 'TaskItem' })
    expect(items).toHaveLength(1)
    expect(items[0].props('taskId')).toBe('7')
  })
})

describe('TaskSection repeatable add-button', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  function repeatableTree(itemName?: string): Task[] {
    return [
      {
        id: '2',
        task: 'Persoonsgegevens',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '2.1',
            task: 'Persoonsgegeven',
            type: ['task_group'],
            repeatable: true,
            ...(itemName ? { item_name: itemName } : {}),
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]
  }

  it('renders the add button with item_name label and adds an instance on click', async () => {
    taskStore.init(repeatableTree('persoonsgegeven'), true)

    const wrapper = mountSection('2')
    const button = wrapper.findComponent({ name: 'UiButton' })
    expect(button.exists()).toBe(true)
    expect(button.props('label')).toBe('Voeg extra persoonsgegeven toe')

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])

    await button.trigger('click')

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])
  })

  it('falls back to the task name (lowercased, stripped) when item_name is absent', () => {
    taskStore.init(repeatableTree(), true)

    const wrapper = mountSection('2')
    const button = wrapper.findComponent({ name: 'UiButton' })
    expect(button.props('label')).toBe('Voeg extra persoonsgegeven toe')
  })

  it('logs error and warning and still adds an instance when the root has not exactly one instance', async () => {
    taskStore.init(repeatableTree('persoonsgegeven'), true)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Root tasks normally have exactly one instance; inject a second to force
    // instanceIds.length !== 1 and reach the throw + catch fallback.
    taskStore.taskInstances[FormType.DPIA]['2[1]'] = {
      id: '2[1]',
      taskId: '2',
      groupId: '2_extra',
      parentInstanceId: null,
      childInstanceIds: [],
    }

    const wrapper = mountSection('2')
    const button = wrapper.findComponent({ name: 'UiButton' })
    await button.trigger('click')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('Failed to add repeatable task with TaskId 2')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('Could not properly create a new item')

    expect(taskStore.getInstanceIdsForTask('2.1').length).toBeGreaterThan(1)
  })

  it('hides the add button when the repeatable child has an instance mapping (canUserCreateInstances false)', () => {
    // Source section "1" must exist because missingSourceDependencies resolves
    // its main task.
    const tasks: Task[] = [
      {
        id: '1',
        task: 'Bronsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '1.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '2.1',
            task: 'Gemapte groep',
            type: ['task_group'],
            repeatable: true,
            dependencies: [
              { type: 'instance_mapping', action: 'create', source: { id: '1.1' } },
            ],
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('2')
    expect(wrapper.findComponent({ name: 'UiButton' }).exists()).toBe(false)
  })

  it('hides the add button when the child is not repeatable (isRepeatable false)', () => {
    const tasks: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '2.1',
            task: 'Subgroep',
            type: ['task_group'],
            tasks: [{ id: '2.1.1', task: 'Veld', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('2')
    expect(wrapper.findComponent({ name: 'UiButton' }).exists()).toBe(false)
  })
})

describe('TaskSection shouldSkipTask', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('skips a child whose dependency source has no values', () => {
    // Section 9 must exist because missingSourceDependencies resolves its main task.
    const tasks: Task[] = [
      {
        id: '9',
        task: 'Bronsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '9.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Groep met afhankelijkheid',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Afhankelijk veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '9.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(false)
  })

  it('renders a child whose dependency source has values', () => {
    const tasks: Task[] = [
      {
        id: '8',
        task: 'Groep met afhankelijkheid',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          { id: '8.0', task: 'Bron veld', type: ['text_input'] },
          {
            id: '8.1',
            task: 'Afhankelijk veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '8.0', operator: 'equals', value: 'ingevuld' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)
    answerStore.answers[FormType.DPIA]['8.0'] = { value: 'ingevuld', lastEditedAt: '2024-01-01' }

    const wrapper = mountSection('8')
    const items = wrapper.findAllComponents({ name: 'TaskItem' })
    const itemIds = items.map((c) => c.props('taskId'))
    expect(itemIds).toContain('8.0')
    expect(itemIds).toContain('8.1')
  })

  it('renders a child with no dependency source (shouldSkipTask false, !sourceId)', () => {
    const tasks: Task[] = [
      {
        id: '8',
        task: 'Groep',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '8.1', task: 'Gewoon veld', type: ['text_input'] }],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(true)
  })
})

describe('TaskSection missingSourceDependencies warning', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('shows a warning listing an unfilled cross-section dependency with official id prefix', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bronsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doelsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    const alert = wrapper.find('.rvo-alert--warning')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Voor deze sectie is het nodig eerst de volgende secties in te vullen:')
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.text()).toContain('Sectie 6:')
    expect(listItem.text()).toContain('Bronsectie')
  })

  it('shows a warning without the "Sectie" prefix when the source section has no official id', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bronsectie zonder id',
        type: ['task_group'],
        is_official_id: false,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doelsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.exists()).toBe(true)
    expect(listItem.text()).not.toContain('Sectie 6:')
    expect(listItem.text()).toContain('Bronsectie zonder id')
  })

  it('does not warn when the dependency source already has values', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bronsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doelsectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'equals', value: 'ingevuld' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)
    answerStore.answers[FormType.DPIA]['6.1'] = { value: 'ingevuld', lastEditedAt: '2024-01-01' }

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('does not warn for a dependency that points back to the current section', () => {
    const tasks: Task[] = [
      {
        id: '8',
        task: 'Sectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          { id: '8.0', task: 'Bron veld', type: ['text_input'] },
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '8.0', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('uses the bare section number as the name when the source main task is missing', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bestaande bron',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doel',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              { type: 'instance_mapping', action: 'create', source: { id: '6.1' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.text()).toContain('Bestaande bron')
  })

  it('collects dependencies declared on intermediate task groups (recursive descendants)', () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bron',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doel',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Tussengroep',
            type: ['task_group'],
            repeatable: true,
            dependencies: [
              { type: 'instance_mapping', action: 'create', source: { id: '6.1' } },
            ],
            tasks: [{ id: '8.1.1', task: 'Diep veld', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(true)
    expect(wrapper.find('.utrecht-unordered-list__item').text()).toContain('Bron')
  })

  it('returns no warning when the section task has no children (missingSourceDependencies early return)', () => {
    const tasks: Task[] = [
      { id: '8', task: 'Enkel', type: ['text_input'], is_official_id: true },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('returns no dependencies and no warning when the section task has undefined childrenIds (defensive guard)', () => {
    const tasks: Task[] = [
      {
        id: '8',
        task: 'Sectie',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '8.1', task: 'Veld', type: ['text_input'] }],
      },
    ]
    taskStore.init(tasks, true)
    // FlatTask always has a childrenIds array in practice; force undefined to
    // reach the defensive early-return guard.
    ;(taskStore.flatTasks[FormType.DPIA]['8'] as { childrenIds?: string[] }).childrenIds =
      undefined as unknown as string[]

    const wrapper = mountSection('8')
    const ss = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
    expect(ss.missingSourceDependencies as unknown[]).toEqual([])
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('skips descendants whose childrenIds are undefined during recursive collection (defensive guard)', () => {
    const tasks: Task[] = [
      {
        id: '8',
        task: 'Sectie',
        type: ['text_input'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Subgroep',
            type: ['task_group'],
            tasks: [{ id: '8.1.1', task: 'Veld', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)
    // Force undefined childrenIds on the nested group to reach the defensive
    // no-recursion branch in collectDescendants.
    ;(taskStore.flatTasks[FormType.DPIA]['8.1'] as { childrenIds?: string[] }).childrenIds =
      undefined as unknown as string[]

    const wrapper = mountSection('8')
    const ss = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
    expect(ss.missingSourceDependencies as unknown[]).toEqual([])
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(true)
  })

  it('falls back to the resolved root id as the name when the source main task lookup yields a falsy task', () => {
    // missingSourceDependencies now resolves the source root section via the
    // non-throwing getTaskByIdFromNamespace + resolveRootSectionId. The falsy
    // ternary (mainTask ? mainTask.task : mainSectionId) is reached by making
    // getTaskByIdFromNamespace return undefined for source section "6":
    //   - resolveRootSectionId('6.1') -> getTaskByIdFromNamespace('6.1') undefined
    //     -> returns '6.1'.split('.')[0] === '6'
    //   - mainTask = getTaskByIdFromNamespace('6') undefined -> header falls back to '6'
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bron',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doel',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Doel veld',
            type: ['text_input'],
            dependencies: [
              // instance_mapping source has no value -> child is skipped and the
              // missingSourceDependencies warning still resolves the source root.
              { type: 'instance_mapping', action: 'create', source: { id: '6.1' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const realGet = taskStore.getTaskByIdFromNamespace
    Object.defineProperty(taskStore, 'getTaskByIdFromNamespace', {
      configurable: true,
      get() {
        return (ns: FormType, id: string) =>
          id.startsWith('6')
            ? (undefined as unknown as ReturnType<typeof realGet>)
            : realGet(ns, id)
      },
    })

    const wrapper = mountSection('8')
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.exists()).toBe(true)
    expect(listItem.text()).toContain('6')
    expect(listItem.text()).not.toContain('Bron')
  })

  it('deduplicates multiple unfilled dependencies pointing to the same source section', async () => {
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Bron',
        type: ['task_group'],
        is_official_id: true,
        tasks: [{ id: '6.1', task: 'Bron veld', type: ['text_input'] }],
      },
      {
        id: '8',
        task: 'Doel',
        type: ['task_group'],
        is_official_id: true,
        tasks: [
          {
            id: '8.1',
            task: 'Veld een',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'any' } },
            ],
          },
          {
            id: '8.2',
            task: 'Veld twee',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    await nextTick()
    const items = wrapper.findAll('.utrecht-unordered-list__item')
    expect(items).toHaveLength(1)
  })
})

describe('TaskSection setup-scope helpers (template-unreachable branches)', () => {
  beforeEach(() => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  function setupState(wrapper: ReturnType<typeof mountSection>) {
    return (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
  }

  it('hasPreScanReferences short-circuits to false for a DPIA signing task', () => {
    // The signing template branch never reads shouldShowPreScanPreview, so the
    // signing guard is only reachable by evaluating the computed directly.
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.init(
      [
        {
          id: '1',
          task: 'Pre-scan vraag',
          type: ['text_input'],
          references: { DPIA: [{ id: '1', type: 'pre-view' }] },
        },
      ],
      true,
    )

    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init([{ id: '1', task: 'Ondertekening', type: ['signing'] }], true)

    const wrapper = mountSection('1')
    const ss = setupState(wrapper)
    expect(ss.hasPreScanReferences as boolean).toBe(false)
    expect(ss.shouldShowPreScanPreview as boolean).toBe(false)
  })

  it('getImage returns undefined for a key absent from the imageMap', () => {
    taskStore.init([{ id: '5', task: 'Sectie', type: ['text_input'], is_official_id: true }], true)

    const wrapper = mountSection('5')
    const ss = setupState(wrapper)
    const getImage = ss.getImage as (key: string) => string | undefined
    expect(getImage('onbekend.png')).toBeUndefined()
    expect(getImage('risico_matrix.png')).toBeTruthy()
  })

  it('falls back to an empty instanceId when the single task has no instance', () => {
    taskStore.init([{ id: '7', task: 'Enkel veld', type: ['text_input'], is_official_id: true }], true)
    // Drop every instance of task "7" so getInstanceIdsForTask returns [] and the
    // `|| ''` fallback is used.
    for (const id of taskStore.getInstanceIdsForTask('7')) {
      delete taskStore.taskInstances[FormType.DPIA][id]
    }

    const wrapper = mountSection('7')
    const item = wrapper.findComponent({ name: 'TaskItem' })
    expect(item.exists()).toBe(true)
    expect(item.props('instanceId')).toBe('')
  })
})

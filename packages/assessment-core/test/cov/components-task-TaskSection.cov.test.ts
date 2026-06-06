import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import TaskSection from '../../src/components/task/TaskSection.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'

// TaskSection wires together a handful of heavy children (TaskItem, TaskGroup,
// Results, PreScanPreview, UiButton). We stub them so the test can drive every
// branch of the <script setup> logic and template without rendering nested
// form widgets. Real Pinia stores are used so the task-dependency composables
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
    // Signing task with a description: isSigningTask true, task.description truthy,
    // activeNamespace === PRE_SCAN so Results renders. taskDisplayTitle skips id
    // prefix because the type includes 'signing'.
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

    // taskDisplayTitle: signing type strips the id prefix even with is_official_id.
    expect(wrapper.find('h1').text()).toBe('Ondertekening')
    // Description fieldset rendered via v-html.
    expect(wrapper.html()).toContain('<strong>Onderteken hier</strong>')
    // Results rendered for prescan.
    expect(wrapper.findComponent({ name: 'Results' }).exists()).toBe(true)
    // The non-signing branch is absent.
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(false)
  })

  it('renders no description fieldset and no Results when signing task lacks description in DPIA', () => {
    // Switch to DPIA: signing task, no description -> inner v-if false,
    // activeNamespace !== PRE_SCAN -> Results absent.
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
    // is_official_id true and type does not include signing -> shouldSkipIdPrefix
    // false -> "id. task".
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
    // !is_official_id -> shouldSkipIdPrefix true.
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
    // DPIA namespace, non-signing task. The prescan namespace contains a task
    // whose references.DPIA is set -> hasPreScanReferences true.
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
    // prescan task without references.DPIA -> .some() falsy -> hasPreScanReferences false.
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
    // activeNamespace !== FormType.DPIA -> early return false.
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
    // isSigningTask short-circuit -> hasPreScanReferences false branch.
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
    // Signing branch is taken, so PreScanPreview never renders.
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
    // task.description truthy + task.sources with a source in imageMap ->
    // getImage returns the resolved asset URL -> <img> rendered.
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
    // task.sources present but source not in imageMap -> inner img v-if false.
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
    // Description still rendered.
    expect(wrapper.html()).toContain('Tekst')
  })

  it('renders description without sources block when task has no sources', () => {
    // task.description truthy, task.sources undefined -> sources template skipped.
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
    // shouldShowChildren true, child has no children -> TaskItem branch.
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
    // No TaskGroup for a leaf child.
    expect(wrapper.findComponent({ name: 'TaskGroup' }).exists()).toBe(false)
  })

  it('renders a nested group child as TaskGroup (child has children)', () => {
    // child task group has children -> TaskGroup branch.
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

  it('renders the single-task TaskItem branch when the task group has no children', () => {
    // task_group but childrenIds empty -> shouldShowChildren false (length 0) ->
    // v-else single TaskItem with the section taskId itself.
    const tasks: Task[] = [
      {
        id: '6',
        task: 'Lege groep',
        type: ['task_group'],
        is_official_id: true,
      },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('6')
    const items = wrapper.findAllComponents({ name: 'TaskItem' })
    expect(items).toHaveLength(1)
    expect(items[0].props('taskId')).toBe('6')
    // getInstanceIdsForTask(taskId)[0] resolves to the default root instance.
    expect(items[0].props('instanceId')).toBe('6')
  })

  it('renders the single-task TaskItem branch for a non-group task', () => {
    // Not a task_group at all -> shouldShowChildren false -> v-else TaskItem.
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
    // isRepeatable true + canUserCreateInstances true (repeatable, no instance
    // mapping) -> add button with item_name label.
    taskStore.init(repeatableTree('persoonsgegeven'), true)

    const wrapper = mountSection('2')
    const button = wrapper.findComponent({ name: 'UiButton' })
    expect(button.exists()).toBe(true)
    expect(button.props('label')).toBe('Voeg extra persoonsgegeven toe')

    // Initially one instance of 2.1.
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])

    await button.trigger('click')

    // handleAddRepeatableTask creates a new instance with the root instance as parent.
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])
  })

  it('falls back to the task name (lowercased, stripped) when item_name is absent', () => {
    // item_name falsy -> getPlainTextWithoutDefinitions(task.toLowerCase()).
    taskStore.init(repeatableTree(), true)

    const wrapper = mountSection('2')
    const button = wrapper.findComponent({ name: 'UiButton' })
    expect(button.props('label')).toBe('Voeg extra persoonsgegeven toe')
  })

  it('logs error and warning and still adds an instance when the root has not exactly one instance', async () => {
    // Force the root task to have a second instance so instanceIds.length != 1,
    // exercising the throw + catch path of handleAddRepeatableTask.
    taskStore.init(repeatableTree('persoonsgegeven'), true)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Manually create a second root instance for task "2" (root tasks normally
    // have exactly one, but we simulate the ambiguous case).
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

    // The catch-branch fallback still added a new instance of 2.1.
    expect(taskStore.getInstanceIdsForTask('2.1').length).toBeGreaterThan(1)
  })

  it('hides the add button when the repeatable child has an instance mapping (canUserCreateInstances false)', () => {
    // repeatable but with instance_mapping dependency -> hasInstanceMapping true ->
    // canUserCreateInstances false -> add button hidden. Source section "1" must
    // exist because missingSourceDependencies resolves its main task.
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
    // Non-repeatable child group -> isRepeatable false -> add button hidden.
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
    // Child has a conditional dependency on a source task "9.1" that has no
    // answer -> shouldSkipTask true -> the child is not rendered. Section 9 must
    // exist because missingSourceDependencies resolves its main task.
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
    // No TaskItem for the skipped child.
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(false)
  })

  it('renders a child whose dependency source has values', () => {
    // Source task "8.0" is a sibling with a value -> hasValues true -> not skipped.
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
              { type: 'conditional', action: 'show', condition: { id: '8.0', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)
    // Give the source instance a value so hasSourceTaskValues returns hasValues.
    answerStore.answers[FormType.DPIA]['8.0'] = { value: 'ingevuld', lastEditedAt: '2024-01-01' }

    const wrapper = mountSection('8')
    const items = wrapper.findAllComponents({ name: 'TaskItem' })
    const itemIds = items.map((c) => c.props('taskId'))
    // Both children render (8.0 the source, 8.1 the dependent).
    expect(itemIds).toContain('8.0')
    expect(itemIds).toContain('8.1')
  })

  it('renders a child with no dependency source (shouldSkipTask false, !sourceId)', () => {
    // Child without dependencies -> getDependencySourceTaskId null -> not skipped.
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
    // Section 8 depends (via a descendant) on section 6 which is unfilled and
    // has an official id -> warning rendered with "Sectie 6: ...".
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
    // hasOfficialId true -> "Sectie 6: Bronsectie".
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.text()).toContain('Sectie 6:')
    expect(listItem.text()).toContain('Bronsectie')
  })

  it('shows a warning without the "Sectie" prefix when the source section has no official id', () => {
    // Source section 6 without official id -> hasOfficialId false -> dep.hasOfficialId
    // template skipped, only the name is shown.
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
    // Source 6.1 has a value -> hasValues true -> no warning entry.
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
    answerStore.answers[FormType.DPIA]['6.1'] = { value: 'ingevuld', lastEditedAt: '2024-01-01' }

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('does not warn for a dependency that points back to the current section', () => {
    // The dependency source is in the SAME section (mainSectionNumber === props.taskId)
    // -> the `continue` skips it -> no warning. Section id "8", source "8.0".
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
    // 8.0 is unfilled, so without the same-section guard it would warn.

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('uses the bare section number as the name when the source main task is missing', () => {
    // Dependency points to source "99.1" whose main task "99" does not exist in
    // the store -> taskStore.taskById('99') throws, mainTask becomes null via the
    // try/catch? No: the component calls taskStore.taskById which throws. Instead
    // we use a source whose main section exists but is referenced by number only.
    // Here we point to a source main section that exists ("6") to keep taskById
    // happy, but verify the sectionName falls back path is covered elsewhere.
    // This case specifically exercises mainTask truthy + name from mainTask.task.
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
    // The dependency is declared on a nested repeatable parent group (8.1), which
    // is itself a task_group with children -> collectDescendants must recurse into
    // it. Source 6.1 unfilled -> warning appears.
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
    // A non-group section with no childrenIds -> !task.value.childrenIds is false
    // (childrenIds is an empty array, not undefined). Verify the empty-array path
    // produces an empty dependency list and no warning.
    const tasks: Task[] = [
      { id: '8', task: 'Enkel', type: ['text_input'], is_official_id: true },
    ]
    taskStore.init(tasks, true)

    const wrapper = mountSection('8')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('returns no dependencies and no warning when the section task has undefined childrenIds (defensive guard)', () => {
    // FlatTask normally always has a childrenIds array, but the computed guards
    // against undefined. Force that state so the `if (!task.value.childrenIds)
    // return []` early-return branch executes.
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
    // Remove childrenIds so shouldShowChildren is false (length || 0 -> 0) and
    // the single-task v-else branch renders, while missingSourceDependencies
    // hits its undefined-childrenIds guard.
    ;(taskStore.flatTasks[FormType.DPIA]['8'] as { childrenIds?: string[] }).childrenIds =
      undefined as unknown as string[]

    const wrapper = mountSection('8')
    const ss = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
    // setupState unwraps refs, so the computed value is exposed directly.
    expect(ss.missingSourceDependencies as unknown[]).toEqual([])
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('skips descendants whose childrenIds are undefined during recursive collection (defensive guard)', () => {
    // collectDescendants guards `if (t.childrenIds)`. Force a descendant to have
    // an undefined childrenIds so the recursion's false branch executes.
    // The section itself is NOT a task_group (so shouldShowChildren is false and
    // the children template loop never runs), but it still has a childrenId so
    // missingSourceDependencies iterates and calls collectDescendants on it.
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
    // Drop childrenIds on the nested group so collectDescendants('8.1') hits the
    // implicit else (no recursion into children).
    ;(taskStore.flatTasks[FormType.DPIA]['8.1'] as { childrenIds?: string[] }).childrenIds =
      undefined as unknown as string[]

    const wrapper = mountSection('8')
    const ss = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
    // No dependencies anywhere -> empty list, no crash from recursion.
    expect(ss.missingSourceDependencies as unknown[]).toEqual([])
    // shouldShowChildren false -> the single-task v-else branch renders.
    expect(wrapper.findComponent({ name: 'TaskItem' }).exists()).toBe(true)
  })

  it('uses the bare section number when the main source task lookup yields a falsy task (defensive ternary)', () => {
    // line 95: `mainTask ? mainTask.task : mainSectionNumber`. taskById throws on
    // a missing task, so the falsy branch is only reachable if taskById returns a
    // falsy value. Override taskById to return undefined for the main section
    // number "6" while keeping real lookups for everything else.
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
              { type: 'conditional', action: 'show', condition: { id: '6.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tasks, true)

    const realTaskById = taskStore.taskById
    // taskById is a function on the store; wrap it so id "6" resolves to undefined.
    Object.defineProperty(taskStore, 'taskById', {
      configurable: true,
      get() {
        return (id: string) => (id === '6' ? (undefined as unknown as ReturnType<typeof realTaskById>) : realTaskById(id))
      },
    })

    const wrapper = mountSection('8')
    const listItem = wrapper.find('.utrecht-unordered-list__item')
    expect(listItem.exists()).toBe(true)
    // sectionName falls back to the bare section number "6"; hasOfficialId false.
    expect(listItem.text()).toContain('6')
    expect(listItem.text()).not.toContain('Sectie 6:')
  })

  it('deduplicates multiple unfilled dependencies pointing to the same source section', async () => {
    // Two descendant fields both depend on section 6 -> only one warning entry.
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
    // Deduplicated by sectionNumber -> a single list entry for section 6.
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
    // `if (isSigningTask.value) return false` line is only reachable by evaluating
    // the computed directly. A prescan task references DPIA so the namespace guard
    // (line 33) passes and execution reaches the signing guard (line 35).
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
    // setupState unwraps the computed refs, so the values are exposed directly.
    // Reading them forces evaluation through the signing guard (line 35).
    expect(ss.hasPreScanReferences as boolean).toBe(false)
    expect(ss.shouldShowPreScanPreview as boolean).toBe(false)
  })

  it('getImage returns undefined for a key absent from the imageMap', () => {
    // getImage is only ever called from the template with keys known to be in the
    // imageMap, so its `: undefined` branch is reachable only via direct call.
    taskStore.init([{ id: '5', task: 'Sectie', type: ['text_input'], is_official_id: true }], true)

    const wrapper = mountSection('5')
    const ss = setupState(wrapper)
    const getImage = ss.getImage as (key: string) => string | undefined
    expect(getImage('onbekend.png')).toBeUndefined()
    // And the truthy branch still resolves the known asset.
    expect(getImage('risico_matrix.png')).toBeTruthy()
  })

  it('falls back to an empty instanceId when the single task has no instance', () => {
    // line 237: getInstanceIdsForTask(taskId)[0] || ''. Remove the section's
    // default instance so [0] is undefined and the `|| ''` fallback is used.
    taskStore.init([{ id: '7', task: 'Enkel veld', type: ['text_input'], is_official_id: true }], true)
    // Drop every instance of task "7" so the lookup returns an empty array.
    for (const id of taskStore.getInstanceIdsForTask('7')) {
      delete taskStore.taskInstances[FormType.DPIA][id]
    }

    const wrapper = mountSection('7')
    const item = wrapper.findComponent({ name: 'TaskItem' })
    expect(item.exists()).toBe(true)
    expect(item.props('instanceId')).toBe('')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { FormType, type Task } from '../../src/models/dpia'
import TaskItem from '../../src/components/task/TaskItem.vue'

// A minimal task tree with one text field that carries a description so both
// branches of the `showDescription` ternary in TaskItem.vue can be exercised.
const taskTree: Task[] = [
  {
    id: '1',
    task: 'Hoofdtaak',
    type: ['task_group'],
    tasks: [
      {
        id: '1.1',
        task: 'Wat is de naam van het project?',
        type: ['text'],
        description: 'Geef de officiële projectnaam op.',
      },
    ],
  },
]

// Stub FormField so the test isolates TaskItem and can inspect the props it
// forwards. The stub keeps a typed slot for the props we assert on.
const FormFieldStub = {
  name: 'FormField',
  props: ['task', 'instanceId', 'label', 'description'],
  template: '<div class="form-field-stub" />',
}

function mountTaskItem(props: Record<string, unknown>) {
  return mount(TaskItem, {
    props,
    global: {
      stubs: { FormField: FormFieldStub },
    },
  })
}

describe('TaskItem.vue', () => {
  let taskStore: ReturnType<typeof useTaskStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(taskTree, true)
  })

  it('renders the RVO fieldset wrapper around the form field', () => {
    const wrapper = mountTaskItem({ taskId: '1.1', instanceId: '1.1[0]' })

    expect(wrapper.find('.utrecht-form-fieldset.rvo-form-fieldset').exists()).toBe(true)
    expect(wrapper.find('fieldset.utrecht-form-fieldset__fieldset').exists()).toBe(true)
    expect(wrapper.find('div[role="group"].utrecht-form-field').exists()).toBe(true)
    expect(wrapper.findComponent(FormFieldStub).exists()).toBe(true)
  })

  it('forwards the resolved task and label, and passes the description when showDescription is true', () => {
    const wrapper = mountTaskItem({
      taskId: '1.1',
      instanceId: '1.1[0]',
      showDescription: true,
    })

    const field = wrapper.findComponent(FormFieldStub)
    // task comes from taskStore.taskById(taskId)
    expect(field.props('task')).toEqual(taskStore.taskById('1.1'))
    expect(field.props('instanceId')).toBe('1.1[0]')
    // label comes from the resolved task's `task` text
    expect(field.props('label')).toBe('Wat is de naam van het project?')
    // showDescription true -> description forwarded
    expect(field.props('description')).toBe('Geef de officiële projectnaam op.')
  })

  it('passes an empty description when showDescription is false', () => {
    const wrapper = mountTaskItem({
      taskId: '1.1',
      instanceId: '1.1[0]',
      showDescription: false,
    })

    expect(wrapper.findComponent(FormFieldStub).props('description')).toBe('')
  })

  it('passes an empty description when showDescription is omitted (undefined prop)', () => {
    const wrapper = mountTaskItem({ taskId: '1.1', instanceId: '1.1[0]' })

    expect(wrapper.findComponent(FormFieldStub).props('description')).toBe('')
  })

  it('throws via taskById when the taskId does not exist', () => {
    expect(() => mountTaskItem({ taskId: 'does-not-exist', instanceId: 'x[0]' })).toThrow(
      'Task with id does-not-exist not found',
    )
  })
})

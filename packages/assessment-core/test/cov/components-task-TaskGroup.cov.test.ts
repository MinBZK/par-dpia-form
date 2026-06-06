import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import TaskGroup from '../../src/components/task/TaskGroup.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'

// Stub FormField to a marker element exposing the props TaskGroup passes.
const FormFieldStub = {
  name: 'FormField',
  props: ['task', 'instanceId', 'label', 'description'],
  template:
    '<div class="form-field-stub" :data-instance="instanceId" :data-task="task && task.id" :data-label="label" :data-description="description"></div>',
}

// ConfirmDeleteDialog uses native <dialog>.showModal which jsdom lacks; stub it
// to re-emit confirm/cancel.
const ConfirmDeleteDialogStub = {
  name: 'ConfirmDeleteDialog',
  props: ['open', 'label', 'summary'],
  emits: ['confirm', 'cancel'],
  template:
    '<div class="confirm-delete-stub" :data-label="label">' +
    '<button class="stub-confirm" @click="$emit(\'confirm\')">confirm</button>' +
    '<button class="stub-cancel" @click="$emit(\'cancel\')">cancel</button>' +
    '</div>',
}

const mounted: ReturnType<typeof mount>[] = []

function mountGroup(taskId: string, instanceId: string) {
  const w = mount(TaskGroup, {
    props: { taskId, instanceId },
    global: {
      stubs: {
        FormField: FormFieldStub,
        ConfirmDeleteDialog: ConfirmDeleteDialogStub,
      },
    },
  })
  mounted.push(w)
  return w
}

afterEach(async () => {
  // Drain runDelete's queued nextTick(() => syncInstances()) BEFORE unmounting,
  // while pinia is still active, or it rejects during coverage teardown.
  await nextTick()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  while (mounted.length) mounted.pop()!.unmount()
})

function buttonByLabel(wrapper: ReturnType<typeof mountGroup>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

let taskStore: ReturnType<typeof useTaskStore>
let answerStore: ReturnType<typeof useAnswerStore>

beforeEach(() => {
  setActivePinia(createPinia())
  taskStore = useTaskStore()
  answerStore = useAnswerStore()
  taskStore.setActiveNamespace(FormType.DPIA)
  answerStore.setActiveNamespace(FormType.DPIA)
})

const richTree: Task[] = [
  {
    id: '2',
    task: 'Persoonsgegevens',
    type: ['task_group'],
    repeatable: true,
    instance_label_template: 'Gegeven {index}',
    item_name: 'persoonsgegeven',
    tasks: [
      { id: '2.1', task: 'Naam', type: ['text_input'], description: 'De naam' },
      {
        id: '2.2',
        task: 'Categorie',
        type: ['text_input'],
        repeatable: true,
        item_name: 'categorie',
      },
      {
        id: '2.3',
        task: 'Bron',
        type: ['task_group'],
        tasks: [{ id: '2.3.1', task: 'Bronnaam', type: ['text_input'] }],
      },
      {
        id: '2.4',
        task: 'Ontvanger',
        type: ['task_group'],
        repeatable: true,
        tasks: [{ id: '2.4.1', task: 'Ontvangernaam', type: ['text_input'] }],
      },
    ],
  },
]

describe('TaskGroup rendering of a rich repeatable group', () => {
  beforeEach(() => {
    taskStore.init(richTree, true)
  })

  it('renders the instance label from the template (isRepeatable true branch + template path)', () => {
    const w = mountGroup('2', '2[0]')
    expect(w.find('legend').text()).toBe('Gegeven {index}')
  })

  it('renders simple non-repeatable child as a FormField with its label/description', () => {
    const w = mountGroup('2', '2[0]')
    const field = w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.1')
    expect(field).toBeTruthy()
    expect(field!.attributes('data-label')).toBe('Naam')
    expect(field!.attributes('data-description')).toBe('De naam')
  })

  it('renders the repeatable simple field plus its tertiary add button using item_name', () => {
    const w = mountGroup('2', '2[0]')
    const field = w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.2')
    expect(field).toBeTruthy()
    expect(buttonByLabel(w, 'Voeg extra categorie toe')).toBeTruthy()
  })

  it('renders a nested TaskGroup for the complex non-repeatable child', () => {
    const w = mountGroup('2', '2[0]')
    const nestedField = w
      .findAll('.form-field-stub')
      .find((f) => f.attributes('data-task') === '2.3.1')
    expect(nestedField).toBeTruthy()
  })

  it('renders a nested TaskGroup for the complex repeatable child plus its add button', () => {
    const w = mountGroup('2', '2[0]')
    const nestedField = w
      .findAll('.form-field-stub')
      .find((f) => f.attributes('data-task') === '2.4.1')
    expect(nestedField).toBeTruthy()
    expect(buttonByLabel(w, 'Voeg extra ontvanger toe')).toBeTruthy()
  })
})

describe('TaskGroup add-button click handlers and item_name fallbacks', () => {
  const tree: Task[] = [
    {
      id: '2',
      task: 'Groep',
      type: ['task_group'],
      tasks: [
        { id: '2.1', task: 'Categorie', type: ['text_input'], repeatable: true },
        {
          id: '2.2',
          task: 'Ontvanger',
          type: ['task_group'],
          repeatable: true,
          item_name: 'ontvanger',
          tasks: [{ id: '2.2.1', task: 'Naam', type: ['text_input'] }],
        },
      ],
    },
  ]

  beforeEach(() => {
    taskStore.init(tree, true)
  })

  it('simple repeatable add button uses the lowercased task text when item_name is absent', () => {
    const w = mountGroup('2', '2')
    expect(buttonByLabel(w, 'Voeg extra categorie toe')).toBeTruthy()
  })

  it('clicking the simple repeatable add button creates a new instance of 2.1', async () => {
    const w = mountGroup('2', '2')
    expect(taskStore.getInstanceIdsForTask('2.1', '2')).toEqual(['2.1[0]'])
    await buttonByLabel(w, 'Voeg extra categorie toe')!.trigger('click')
    await nextTick()
    expect(taskStore.getInstanceIdsForTask('2.1', '2')).toEqual(['2.1[0]', '2.1[1]'])
  })

  it('clicking the complex repeatable add button creates a new instance of 2.2', async () => {
    const w = mountGroup('2', '2')
    expect(taskStore.getInstanceIdsForTask('2.2', '2')).toEqual(['2.2[0]'])
    await buttonByLabel(w, 'Voeg extra ontvanger toe')!.trigger('click')
    await nextTick()
    expect(taskStore.getInstanceIdsForTask('2.2', '2')).toEqual(['2.2[0]', '2.2[1]'])
  })
})

describe('TaskGroup non-repeatable parent (isRepeatable false / fallback label)', () => {
  it('uses task.task as the legend when no template and not repeatable, and shows no parent delete button', () => {
    const tree: Task[] = [
      {
        id: '3',
        task: 'Beoordeling',
        type: ['task_group'],
        tasks: [{ id: '3.1', task: 'Score', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('3', '3')
    expect(w.find('legend').text()).toBe('Beoordeling')
    expect(buttonByLabel(w, 'Verwijder')).toBeUndefined()
  })

  it('uses task.task as the legend when repeatable but no template (ternary repeatable branch)', () => {
    const tree: Task[] = [
      {
        id: '4',
        task: 'Herhaalbaar zonder template',
        type: ['task_group'],
        repeatable: true,
        tasks: [{ id: '4.1', task: 'Veld', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('4', '4[0]')
    expect(w.find('legend').text()).toBe('Herhaalbaar zonder template')
  })
})

describe('TaskGroup missingSourceMessage', () => {
  const mappingTree: Task[] = [
    {
      id: '3',
      task: 'Verwerkingen',
      type: ['task_group'],
      repeatable: true,
      tasks: [{ id: '3.1', task: 'Verwerkingsnaam', type: ['text_input'] }],
    },
    {
      id: '6',
      task: 'Beveiliging',
      type: ['task_group'],
      repeatable: true,
      dependencies: [
        { type: 'instance_mapping', action: 'create', source: { id: '3.1' } },
      ],
      tasks: [{ id: '6.1', task: 'Maatregel', type: ['text_input'] }],
    },
  ]

  it('returns null when there is no instance_mapping dependency (no warning, body shown)', () => {
    taskStore.init(mappingTree, true)
    const w = mountGroup('3', '3[0]')
    expect(w.find('.rvo-alert--warning').exists()).toBe(false)
    expect(w.findAll('.form-field-stub').length).toBeGreaterThan(0)
  })

  it('shows the warning message when the mapped source answer is still empty', async () => {
    taskStore.init(mappingTree, true)
    taskStore.setInstanceMappingSource('6[0]', '3.1[0]')
    const w = mountGroup('6', '6[0]')
    await nextTick()
    const alert = w.find('.rvo-alert--warning')
    expect(alert.exists()).toBe(true)
    expect(alert.find('.rvo-alert-text').text()).toContain(
      'Vul eerst "Verwerkingsnaam" in bij sectie "3. Verwerkingen".',
    )
    expect(w.find('.form-field-stub').exists()).toBe(false)
  })

  it('returns null (no warning) when the mapped source answer has a value', async () => {
    taskStore.init(mappingTree, true)
    taskStore.setInstanceMappingSource('6[0]', '3.1[0]')
    answerStore.setAnswer('3.1[0]', 'Salarisadministratie')
    const w = mountGroup('6', '6[0]')
    await nextTick()
    expect(w.find('.rvo-alert--warning').exists()).toBe(false)
    expect(w.findAll('.form-field-stub').length).toBeGreaterThan(0)
  })

  it('returns null when the mapping dependency lacks a source id', () => {
    const tree: Task[] = [
      {
        id: '6',
        task: 'Beveiliging',
        type: ['task_group'],
        repeatable: true,
        dependencies: [{ type: 'instance_mapping', action: 'create' }],
        tasks: [{ id: '6.1', task: 'Maatregel', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('6', '6[0]')
    expect(w.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('returns null when the instance is not mapped to a source (no mappedFromInstanceId)', () => {
    taskStore.init(mappingTree, true)
    const w = mountGroup('6', '6[0]')
    expect(w.find('.rvo-alert--warning').exists()).toBe(false)
  })
})

describe('TaskGroup repeatable simple field: delete button visibility', () => {
  const simpleRepeatableTree: Task[] = [
    {
      id: '2',
      task: 'Persoonsgegevens',
      type: ['task_group'],
      tasks: [{ id: '2.1', task: 'Categorie', type: ['text_input'], repeatable: true }],
    },
  ]

  it('hides the per-instance delete button when only one instance exists', () => {
    taskStore.init(simpleRepeatableTree, true)
    const w = mountGroup('2', '2')
    expect(buttonByLabel(w, 'Verwijder veld')).toBeUndefined()
    expect(buttonByLabel(w, 'Voeg extra')).toBeTruthy()
  })

  it('shows a delete button per repeatable instance once more than one exists', async () => {
    taskStore.init(simpleRepeatableTree, true)
    taskStore.addRepeatableTaskInstance('2.1', '2')
    const w = mountGroup('2', '2')
    await nextTick()
    const deleteButtons = w.findAll('button').filter((b) => b.text().includes('Verwijder veld'))
    expect(deleteButtons.length).toBe(2)
  })
})

describe('TaskGroup delete flow without impacted answers (runDelete direct path)', () => {
  const simpleRepeatableTree: Task[] = [
    {
      id: '2',
      task: 'Persoonsgegevens',
      type: ['task_group'],
      tasks: [{ id: '2.1', task: 'Categorie', type: ['text_input'], repeatable: true }],
    },
  ]

  it('deletes immediately (no confirm dialog) when there are no impacted answers', async () => {
    taskStore.init(simpleRepeatableTree, true)
    taskStore.addRepeatableTaskInstance('2.1', '2')
    expect(taskStore.getInstanceIdsForTask('2.1', '2')).toEqual(['2.1[0]', '2.1[1]'])

    const w = mountGroup('2', '2')
    await nextTick()
    const deleteButton = w.findAll('button').filter((b) => b.text().includes('Verwijder veld'))[1]
    await deleteButton.trigger('click')
    await nextTick()

    expect(w.find('.confirm-delete-stub').exists()).toBe(false)
    expect(taskStore.getInstanceIdsForTask('2.1', '2')).toEqual(['2.1[0]'])
  })
})

describe('TaskGroup parent-instance delete button (isRepeatable && canCreate && hasMoreThanOneInstance)', () => {
  const repeatableGroupTree: Task[] = [
    {
      id: '2',
      task: 'Persoonsgegeven',
      type: ['task_group'],
      repeatable: true,
      item_name: 'persoonsgegeven',
      tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
    },
  ]

  it('shows the parent delete button (with item_name) when more than one group instance exists', async () => {
    taskStore.init(repeatableGroupTree, true)
    taskStore.addRepeatableTaskInstance('2')
    const w = mountGroup('2', '2[0]')
    await nextTick()
    expect(buttonByLabel(w, 'Verwijder persoonsgegeven')).toBeTruthy()
  })

  it('falls back to plain task text in the parent delete label when item_name is absent', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Persoonsgegeven',
        type: ['task_group'],
        repeatable: true,
        tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2')
    const w = mountGroup('2', '2[0]')
    await nextTick()
    expect(buttonByLabel(w, 'Verwijder persoonsgegeven')).toBeTruthy()
  })

  it('hides the parent delete button when only one group instance exists', () => {
    taskStore.init(repeatableGroupTree, true)
    const w = mountGroup('2', '2[0]')
    expect(buttonByLabel(w, 'Verwijder persoonsgegeven')).toBeUndefined()
  })
})

describe('TaskGroup delete flow WITH impacted answers (confirm dialog)', () => {
  const tree: Task[] = [
    {
      id: '2',
      task: 'Persoonsgegeven',
      type: ['task_group'],
      repeatable: true,
      instance_label_template: 'Gegeven {index}',
      item_name: 'persoonsgegeven',
      tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
    },
  ]

  beforeEach(() => {
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2')
    answerStore.setAnswer('2.1[1]', 'Emailadres')
  })

  it('opens the confirm dialog with a rendered label when deleting an impacted instance', async () => {
    const w = mountGroup('2', '2[1]')
    await nextTick()
    const deleteButton = buttonByLabel(w, 'Verwijder persoonsgegeven')!
    await deleteButton.trigger('click')
    await nextTick()
    const dialog = w.find('.confirm-delete-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-label')).toBe('Gegeven {index}')
  })

  it('confirmPendingDelete removes the instance and closes the dialog', async () => {
    const w = mountGroup('2', '2[1]')
    await nextTick()
    await buttonByLabel(w, 'Verwijder persoonsgegeven')!.trigger('click')
    await nextTick()
    expect(taskStore.getInstanceById('2[1]')).not.toBeNull()

    await w.find('.stub-confirm').trigger('click')
    await nextTick()
    expect(w.find('.confirm-delete-stub').exists()).toBe(false)
    expect(taskStore.getInstanceById('2[1]')).toBeNull()
  })

  it('cancelPendingDelete clears the pending state without deleting', async () => {
    const w = mountGroup('2', '2[1]')
    await nextTick()
    await buttonByLabel(w, 'Verwijder persoonsgegeven')!.trigger('click')
    await nextTick()
    expect(w.find('.confirm-delete-stub').exists()).toBe(true)

    await w.find('.stub-cancel').trigger('click')
    await nextTick()
    expect(w.find('.confirm-delete-stub').exists()).toBe(false)
    expect(taskStore.getInstanceById('2[1]')).not.toBeNull()
  })
})

describe('TaskGroup handleDelete label fallback when target instance/template missing', () => {
  const tree: Task[] = [
    {
      id: '2',
      task: '<b>Persoonsgegeven</b>',
      type: ['task_group'],
      repeatable: true,
      tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
    },
  ]

  it('uses the plain task text (tags stripped) when no instance_label_template', async () => {
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2')
    answerStore.setAnswer('2.1[1]', 'Emailadres')
    const w = mountGroup('2', '2[1]')
    await nextTick()
    await buttonByLabel(w, 'Verwijder')!.trigger('click')
    await nextTick()
    const dialog = w.find('.confirm-delete-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-label')).toBe('Persoonsgegeven')
  })
})

describe('TaskGroup confirmPendingDelete early return guard', () => {
  it('does nothing when there is no pending delete', () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('2', '2')
    const vm = w.vm as unknown as { confirmPendingDelete: () => void }
    expect(() => vm.confirmPendingDelete()).not.toThrow()
  })
})

describe('TaskGroup hasMoreThanOneInstance via child without explicit parentInstanceId', () => {
  it('resolves the parent from the current instance when parentInstanceId is omitted', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        tasks: [
          {
            id: '2.1',
            task: 'Sub',
            type: ['task_group'],
            repeatable: true,
            item_name: 'sub',
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2.1', '2')
    const w = mountGroup('2.1', '2.1[0]')
    await nextTick()
    expect(buttonByLabel(w, 'Verwijder sub')).toBeTruthy()
  })
})

describe('TaskGroup complex repeatable add button hidden when no visible instance', () => {
  const tree: Task[] = [
    {
      id: '2',
      task: 'Groep',
      type: ['task_group'],
      tasks: [
        { id: '2.0', task: 'Schakelaar', type: ['radio_option'] },
        {
          id: '2.1',
          task: 'Verborgen subgroep',
          type: ['task_group'],
          repeatable: true,
          item_name: 'subgroep',
          dependencies: [
            {
              type: 'conditional',
              action: 'show',
              condition: { id: '2.0', operator: 'equals', value: true },
            },
          ],
          tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
        },
      ],
    },
  ]

  it('hides both the nested group and its add button while the condition is unmet', async () => {
    taskStore.init(tree, true)
    const w = mountGroup('2', '2')
    await nextTick()
    expect(w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.1.1')).toBeFalsy()
    expect(buttonByLabel(w, 'Voeg extra subgroep toe')).toBeUndefined()
  })

  it('shows the nested group and add button once the condition is met (hasVisibleInstance true)', async () => {
    taskStore.init(tree, true)
    answerStore.setAnswer('2.0', 'true')
    const w = mountGroup('2', '2')
    await nextTick()
    expect(
      w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.1.1'),
    ).toBeTruthy()
    expect(buttonByLabel(w, 'Voeg extra subgroep toe')).toBeTruthy()
  })
})

describe('TaskGroup simple repeatable field hidden by condition (shouldShowTask false in rep loop)', () => {
  it('does not render a repeatable simple field when its condition is unmet', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        tasks: [
          { id: '2.0', task: 'Schakelaar', type: ['radio_option'] },
          {
            id: '2.1',
            task: 'Verborgen veld',
            type: ['text_input'],
            repeatable: true,
            item_name: 'veld',
            dependencies: [
              {
                type: 'conditional',
                action: 'show',
                condition: { id: '2.0', operator: 'equals', value: 'true' },
              },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('2', '2')
    await nextTick()
    expect(w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.1')).toBeFalsy()
  })
})

describe('TaskGroup non-repeatable simple/complex children hidden by condition', () => {
  it('hides a non-repeatable simple field and a non-repeatable group when condition unmet', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        tasks: [
          { id: '2.0', task: 'Schakelaar', type: ['radio_option'] },
          {
            id: '2.1',
            task: 'Verborgen veld',
            type: ['text_input'],
            dependencies: [
              {
                type: 'conditional',
                action: 'show',
                condition: { id: '2.0', operator: 'equals', value: 'true' },
              },
            ],
          },
          {
            id: '2.2',
            task: 'Verborgen groep',
            type: ['task_group'],
            dependencies: [
              {
                type: 'conditional',
                action: 'show',
                condition: { id: '2.0', operator: 'equals', value: 'true' },
              },
            ],
            tasks: [{ id: '2.2.1', task: 'Sub', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    const w = mountGroup('2', '2')
    await nextTick()
    expect(w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.1')).toBeFalsy()
    expect(
      w.findAll('.form-field-stub').find((f) => f.attributes('data-task') === '2.2.1'),
    ).toBeFalsy()
  })
})

describe('TaskGroup hasVisibleInstance returns false when no instances exist (length 0)', () => {
  it('hides the complex repeatable add button when the child has zero instances', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        tasks: [
          {
            id: '2.1',
            task: 'Subgroep',
            type: ['task_group'],
            repeatable: true,
            item_name: 'subgroep',
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.removeRepeatableTaskInstance('2.1[0]')
    expect(taskStore.getInstanceIdsForTask('2.1', '2')).toEqual([])

    const w = mountGroup('2', '2')
    await nextTick()
    expect(buttonByLabel(w, 'Voeg extra subgroep toe')).toBeUndefined()
  })
})

describe('TaskGroup handleDelete with a missing target instance (targetTask null → plain text label)', () => {
  it('falls back to the group task text when the deleted instance no longer exists', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: '<i>Persoonsgegeven</i>',
        type: ['task_group'],
        repeatable: true,
        tasks: [{ id: '2.1', task: 'Naam', type: ['text_input'] }],
      },
    ]
    taskStore.init(tree, true)
    // Answer on an instance id with no registered TaskInstance: an impact is
    // reported but getInstanceById returns null.
    answerStore.setAnswer('2[5]', 'Weesantwoord')

    const w = mountGroup('2', '2[0]')
    const vm = w.vm as unknown as { handleDelete: (id: string) => void }
    vm.handleDelete('2[5]')
    await nextTick()

    const dialog = w.find('.confirm-delete-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-label')).toBe('Persoonsgegeven')

    await w.find('.stub-confirm').trigger('click')
    await nextTick()
    expect(w.find('.confirm-delete-stub').exists()).toBe(false)
    expect(answerStore.getAnswer('2[5]')).toBeNull()
  })
})

describe('TaskGroup collectInstanceIds recurses through child instances on delete', () => {
  it('removes a group instance and all its nested child answers', async () => {
    const tree: Task[] = [
      {
        id: '2',
        task: 'Groep',
        type: ['task_group'],
        repeatable: true,
        item_name: 'groep',
        tasks: [
          {
            id: '2.1',
            task: 'Subgroep',
            type: ['task_group'],
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2')
    answerStore.setAnswer('2.1.1[1]', 'Naamwaarde')
    expect(answerStore.getAnswer('2.1.1[1]')).toBe('Naamwaarde')

    const w = mountGroup('2', '2[1]')
    await nextTick()
    await buttonByLabel(w, 'Verwijder groep')!.trigger('click')
    await nextTick()
    await w.find('.stub-confirm').trigger('click')
    await nextTick()

    expect(taskStore.getInstanceById('2[1]')).toBeNull()
    expect(taskStore.getInstanceById('2.1.1[1]')).toBeNull()
    expect(answerStore.getAnswer('2.1.1[1]')).toBeNull()
  })
})

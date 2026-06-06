import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import TaskGroup from '../../src/components/task/TaskGroup.vue'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'

// FormField pulls in markdown/image rendering and many composables that are
// irrelevant to TaskGroup's own logic, so stub it to a marker element that
// still surfaces the props TaskGroup passes (task id / instanceId) for asserts.
const FormFieldStub = {
  name: 'FormField',
  props: ['task', 'instanceId', 'label', 'description'],
  template:
    '<div class="form-field-stub" :data-instance="instanceId" :data-task="task && task.id" :data-label="label" :data-description="description"></div>',
}

// ConfirmDeleteDialog uses native <dialog>.showModal which jsdom lacks; replace
// with a lightweight stub that re-emits confirm/cancel so we can drive
// confirmPendingDelete / cancelPendingDelete from the parent.
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

// Track every mounted wrapper so we can unmount and flush pending microtasks
// after each test. runDelete() schedules `nextTick(() => syncInstances())`;
// if that callback fired after the test ended (and after the istanbul
// coverage provider began writing its temp files) it surfaced as an unhandled
// rejection. Flushing here keeps each test self-contained.
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
  // Drain any queued nextTick(() => syncInstances()) callbacks (scheduled by
  // runDelete) BEFORE unmounting, while the pinia stores are still active, so
  // nothing rejects during teardown. Flush both the Vue microtask queue and a
  // macrotask turn to be safe under the (timing-sensitive) coverage provider.
  await nextTick()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  while (mounted.length) mounted.pop()!.unmount()
})

// Find a UiButton-rendered <button> by visible label text.
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

/**
 * A rich tree that exercises both simple and complex children under a
 * repeatable parent group:
 *   2 (root, repeatable group)
 *     2.1  simple non-repeatable text field
 *     2.2  simple repeatable text field (with item_name)
 *     2.3  complex non-repeatable group  → 2.3.1 text
 *     2.4  complex repeatable group (no item_name) → 2.4.1 text
 */
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
    // instance_label_template wins over the fallback; "{index}" stays literal
    // because there is no mappedFromInstanceId on the instance.
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
    // Add button uses item_name: "Voeg extra categorie toe"
    expect(buttonByLabel(w, 'Voeg extra categorie toe')).toBeTruthy()
  })

  it('renders a nested TaskGroup for the complex non-repeatable child', () => {
    const w = mountGroup('2', '2[0]')
    // The nested group renders its own legend + the 2.3.1 FormField.
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
    // 2.4 has no item_name, so the add label falls back to the plain task text.
    expect(buttonByLabel(w, 'Voeg extra ontvanger toe')).toBeTruthy()
  })
})

describe('TaskGroup add-button click handlers and item_name fallbacks', () => {
  // Simple repeatable WITHOUT item_name (fallback label branch) and complex
  // repeatable WITH item_name (item_name branch). Clicking each add button
  // exercises the inline addRepeatableTaskInstance handlers.
  const tree: Task[] = [
    {
      id: '2',
      task: 'Groep',
      type: ['task_group'],
      tasks: [
        // No item_name → label falls back to plain task text.
        { id: '2.1', task: 'Categorie', type: ['text_input'], repeatable: true },
        {
          id: '2.2',
          task: 'Ontvanger',
          type: ['task_group'],
          repeatable: true,
          item_name: 'ontvanger', // item_name branch on the complex add button
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
    // Fallback: getPlainTextWithoutDefinitions("categorie") → "categorie".
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
    // Not repeatable → the final "Verwijder ..." parent delete button is absent.
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
  // A repeatable target group mapped from a source field. When the source
  // answer is empty, a warning message replaces the form body.
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
    // Map instance 6[0] to source instance 3.1[0]; leave 3.1[0] empty.
    taskStore.setInstanceMappingSource('6[0]', '3.1[0]')
    const w = mountGroup('6', '6[0]')
    await nextTick()
    const alert = w.find('.rvo-alert--warning')
    expect(alert.exists()).toBe(true)
    expect(alert.find('.rvo-alert-text').text()).toContain(
      'Vul eerst "Verwerkingsnaam" in bij sectie "3. Verwerkingen".',
    )
    // Form body is hidden while the warning is shown.
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
        // instance_mapping with no source → mappingDep.source?.id is undefined.
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
    // 6[0] has the mapping dependency but was never wired to a source instance.
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
    // Only the add button should be present, not "Verwijder veld".
    expect(buttonByLabel(w, 'Verwijder veld')).toBeUndefined()
    expect(buttonByLabel(w, 'Voeg extra')).toBeTruthy()
  })

  it('shows a delete button per repeatable instance once more than one exists', async () => {
    taskStore.init(simpleRepeatableTree, true)
    // Add a second instance of 2.1 under the parent instance "2".
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

    // No confirm dialog appears (impacted.length === 0 → runDelete).
    expect(w.find('.confirm-delete-stub').exists()).toBe(false)
    // One instance was removed.
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
    // No item_name → label uses lowercased plain text "persoonsgegeven".
    expect(buttonByLabel(w, 'Verwijder persoonsgegeven')).toBeTruthy()
  })

  it('hides the parent delete button when only one group instance exists', () => {
    taskStore.init(repeatableGroupTree, true)
    const w = mountGroup('2', '2[0]')
    expect(buttonByLabel(w, 'Verwijder persoonsgegeven')).toBeUndefined()
  })
})

describe('TaskGroup delete flow WITH impacted answers (confirm dialog)', () => {
  // Deleting a repeatable group instance whose own answers are filled produces
  // impacted answers → the ConfirmDeleteDialog is shown.
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
    // Fill answers in instance [1] so deleting it has an impact footprint.
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
    // labelTemplate present → renderInstanceLabel used (HTML tags stripped).
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
    // Instance still present — nothing was deleted.
    expect(taskStore.getInstanceById('2[1]')).not.toBeNull()
  })
})

describe('TaskGroup handleDelete label fallback when target instance/template missing', () => {
  // A repeatable group WITHOUT instance_label_template, with impacted answers,
  // exercises the `labelTemplate ? ... : getPlainTextWithoutDefinitions` else.
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
    // getPlainTextWithoutDefinitions strips <b>, .replace strips any remaining tags.
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
    // pendingDelete is null; calling confirm must be a no-op (no throw).
    const vm = w.vm as unknown as { confirmPendingDelete: () => void }
    expect(() => vm.confirmPendingDelete()).not.toThrow()
  })
})

describe('TaskGroup hasMoreThanOneInstance via child without explicit parentInstanceId', () => {
  // When the per-child delete button calls hasMoreThanOneInstance(childId,
  // props.instanceId), parentInstanceId is provided. The parent delete button
  // calls hasMoreThanOneInstance(taskId) with NO parentInstanceId, exercising
  // the `!parentInstanceId` branch which looks up the current instance's parent.
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
    // Add a second instance of the repeatable sub-group under 2.1's parent (2).
    taskStore.addRepeatableTaskInstance('2.1', '2')
    // Mount the nested repeatable group instance directly so its own parent
    // delete button evaluates hasMoreThanOneInstance('2.1') without an arg.
    const w = mountGroup('2.1', '2.1[0]')
    await nextTick()
    expect(buttonByLabel(w, 'Verwijder sub')).toBeTruthy()
  })
})

describe('TaskGroup complex repeatable add button hidden when no visible instance', () => {
  // hasVisibleInstance returns false when a conditional dependency hides every
  // instance → the complex-repeatable add button is not rendered.
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
    // Condition 2.0 is unset → shouldShowTask is false for 2.1 instances.
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
    // Field hidden, but the add button (canUserCreateInstances) still renders.
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
    // Remove the only instance so getInstanceIdsForTask('2.1', '2') is empty,
    // forcing hasVisibleInstance to hit the `length === 0 → return false` path.
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
    // Phantom answer on an instance id that has no registered TaskInstance, so
    // findImpactedByDelete reports an impact but getInstanceById returns null.
    answerStore.setAnswer('2[5]', 'Weesantwoord')

    const w = mountGroup('2', '2[0]')
    const vm = w.vm as unknown as { handleDelete: (id: string) => void }
    vm.handleDelete('2[5]')
    await nextTick()

    const dialog = w.find('.confirm-delete-stub')
    expect(dialog.exists()).toBe(true)
    // labelTemplate is undefined (targetTask null) → plain text of task.task.
    expect(dialog.attributes('data-label')).toBe('Persoonsgegeven')

    // Confirming runs runDelete('2[5]') → collectInstanceIds('2[5]'); since no
    // TaskInstance exists for that id, the `!instance → return [instanceId]`
    // guard fires and the phantom answer is removed.
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
    // Fill a nested answer in the [1] subtree so handleDelete sees an impact and
    // confirmPendingDelete → runDelete → collectInstanceIds walks children.
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
    // The nested answer was removed via removeAnswerForInstances(collectInstanceIds).
    expect(answerStore.getAnswer('2.1.1[1]')).toBeNull()
  })
})

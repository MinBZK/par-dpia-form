import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import { useTaskStore, type FlatTask } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'
import FormField from '../../src/components/task/FormField.vue'
import { CONTENT_READONLY_KEY } from '../../src/injectionKeys'

function flatTask(overrides: Partial<FlatTask> = {}): FlatTask {
  return {
    id: '1.1',
    task: 'Een taak',
    type: ['text_input'],
    parentId: null,
    childrenIds: [],
    ...overrides,
  }
}

type MountProps = {
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}

function mountField(props: MountProps, readonly = false) {
  return mount(FormField, {
    props,
    global: {
      provide: { [CONTENT_READONLY_KEY as symbol]: ref(readonly) },
      // Stub ImageField to keep the image-upload component out of the mount.
      stubs: {
        ImageField: { name: 'ImageField', props: ['task', 'instanceId', 'label', 'description'], template: '<div class="image-field-stub" />' },
      },
    },
  })
}

// NLDD fields deliver their value via a CustomEvent with a detail payload.
function dispatchNlddInput(el: Element, value: string) {
  el.dispatchEvent(new CustomEvent('input', { detail: { value } }))
}

// nldd-segmented-control reports the newly chosen value in the change detail;
// the host is unregistered in jsdom, so the test dispatches it.
function chooseMode(el: Element, preview: boolean) {
  el.dispatchEvent(new CustomEvent('change', { detail: { value: preview ? 'lezen' : 'bewerken' } }))
}

describe('FormField.vue', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  describe('label, description and open_text toggle', () => {
    it('renders the label and description blocks when provided', () => {
      const wrapper = mountField({
        task: flatTask(),
        instanceId: '1.1[0]',
        label: 'Mijn label',
        description: 'Mijn omschrijving',
      })
      const labelWrapper = wrapper.find('div.form-field__label')
      expect(labelWrapper.exists()).toBe(true)
      const label = labelWrapper.find('label')
      expect(label.exists()).toBe(true)
      expect(label.attributes('class')).toBeUndefined()
      expect(label.attributes('id')).toBe('label-1.1-1.1[0]')
      expect(label.element.innerHTML).toContain('Mijn label')
      const desc = wrapper.find('.form-field__description')
      expect(desc.exists()).toBe(true)
      expect(desc.attributes('id')).toBe('description-1.1-1.1[0]')
      expect(desc.element.innerHTML).toContain('Mijn omschrijving')
    })

    it('omits the label block entirely when no label is given', () => {
      const wrapper = mountField({ task: flatTask(), instanceId: '1.1[0]' })
      expect(wrapper.find('div.form-field__label').exists()).toBe(false)
      expect(wrapper.find('nldd-text-field').attributes('accessible-label')).toBeUndefined()
    })

    it('renders the open_text field as a text editor, with nothing to preview', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })

      // nldd-text-editor shows the formatting while you type, so there is no
      // read/edit switch and no second rendering of the same text.
      const editor = wrapper.find('nldd-text-editor')
      expect(editor.exists()).toBe(true)
      expect(editor.attributes('variant')).toBe('input-field')
      expect(editor.attributes('rows')).toBe('5')
      expect(editor.attributes('resize')).toBe('auto')
      expect(editor.attributes('dir')).toBe('auto')
      expect(editor.attributes('input-id')).toBe('field-1.1-1.1[0]')

      expect(wrapper.find('nldd-segmented-control').exists()).toBe(false)
      expect(wrapper.find('.markdown-preview').exists()).toBe(false)
    })

    it('does not render an editor when the field is not open_text', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['text_input'] }),
        instanceId: '1.1',
        label: 'Naam',
      })
      expect(wrapper.find('nldd-text-editor').exists()).toBe(false)
    })
  })

  describe('text_input field', () => {
    it('renders the stored value and writes NLDD input events back to the store', async () => {
      answerStore.setAnswer('1.1[0]', 'bestaande waarde')
      const wrapper = mountField({
        task: flatTask({ type: ['text_input'] }),
        instanceId: '1.1[0]',
        label: 'Naam',
      })
      const field = wrapper.find('nldd-text-field')
      expect(field.exists()).toBe(true)
      expect(field.attributes('value')).toBe('bestaande waarde')
      expect(field.attributes('input-id')).toBe('field-1.1-1.1[0]')
      expect(field.attributes('dir')).toBe('auto')
      expect(field.attributes('accessible-label')).toBe('Naam')
      expect(field.attributes('aria-labelledby')).toBeUndefined()

      dispatchNlddInput(field.element, 'nieuwe waarde')
      expect(answerStore.getAnswer('1.1[0]')).toBe('nieuwe waarde')
      await nextTick()
      expect(field.attributes('value')).toBe('nieuwe waarde')
    })
  })

  describe('open_text editor input', () => {
    it('renders the editor attributes and writes input back to the store', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      const field = wrapper.find('nldd-text-editor')
      expect(field.exists()).toBe(true)
      expect(field.attributes('input-id')).toBe('field-1.1-1.1[0]')
      expect(field.attributes('dir')).toBe('auto')
      expect(field.attributes('accessible-label')).toBe('Toelichting')
      expect(field.attributes('rows')).toBe('5')
      expect(field.attributes('resize')).toBe('auto')
      expect(field.attributes('value')).toBe('')

      dispatchNlddInput(field.element, 'regel een\nregel twee')
      expect(answerStore.getAnswer('1.1[0]')).toBe('regel een\nregel twee')
      await nextTick()
      expect(field.attributes('value')).toBe('regel een\nregel twee')
    })

    it('keeps the editor value attribute in sync with the store', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      const field = wrapper.find('nldd-text-editor')
      expect(field.attributes('value')).toBe('')

      answerStore.setAnswer('1.1[0]', 'nieuwe inhoud')
      await nextTick()
      expect(field.attributes('value')).toBe('nieuwe inhoud')
    })
  })

  describe('radio_option field', () => {
    it('renders a labelled radiogroup, marks the selected option and updates on change', async () => {
      answerStore.setAnswer('1.1[0]', 'ja')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [
            { value: 'ja', label: 'Ja' },
            { value: 'nee', label: 'Nee' },
          ],
        }),
        instanceId: '1.1[0]',
        label: 'Akkoord?',
      })
      // Plain labels: the design system's group handles arrow keys and mutual
      // exclusion, so no hand-rolled radiogroup remains.
      const group = wrapper.find('nldd-radio-button-group')
      expect(group.exists()).toBe(true)
      expect(group.attributes('name')).toBe('group-1.1-1.1[0]')
      expect(group.attributes('accessible-labeled-by')).toBe('label-1.1-1.1[0]')
      expect(wrapper.find('div.form-field__choices').exists()).toBe(false)

      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios).toHaveLength(2)
      expect(radios.map((r) => r.attributes('label'))).toEqual(['Ja', 'Nee'])
      expect(radios[0].attributes('checked')).toBeDefined()
      expect(radios[1].attributes('checked')).toBeUndefined()

      group.element.dispatchEvent(new CustomEvent('change', { detail: { value: 'nee' } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toBe('nee')
    })

    it('omits aria-labelledby on the native fallback when there is no label', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [
            { value: null, label: '<span class="aiv-definition">Onbekend</span>' },
            { value: 'ja', label: 'Ja' },
          ],
        }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('div.form-field__choices').attributes('aria-labelledby')).toBeUndefined()
    })

    it('ignores a group change without a value', async () => {
      answerStore.setAnswer('1.1[0]', 'ja')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [
            { value: 'ja', label: 'Ja' },
            { value: 'nee', label: 'Nee' },
          ],
        }),
        instanceId: '1.1[0]',
      })
      // The group re-emits the field's change, so a payload-less duplicate must
      // not wipe the stored answer.
      await wrapper.find('nldd-radio-button-group').trigger('change')
      expect(answerStore.getAnswer('1.1[0]')).toBe('ja')
    })

    it('renders the design system group for a radio field without any options', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['radio_option'], options: undefined }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('nldd-radio-button-group').exists()).toBe(true)
      expect(wrapper.findAll('nldd-radio-button-field')).toHaveLength(0)
    })

    it('splits the control from the label when an option carries definition markup', async () => {
      answerStore.setAnswer('1.1[0]', 'ja')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [
            { value: 'ja', label: '<span class="aiv-definition">Ja</span>' },
            { value: 'nee', label: 'Nee' },
          ],
        }),
        instanceId: '1.1[0]',
        label: 'Akkoord?',
      })
      // nldd-radio-button-field takes plain text only, so the bare control does
      // the drawing and the label stays in light DOM where markup renders.
      expect(wrapper.find('nldd-radio-button-group').exists()).toBe(false)
      expect(wrapper.find('div.form-field__choices').attributes('role')).toBe('radiogroup')

      const radios = wrapper.findAll('.form-field__choice nldd-radio-button')
      expect(radios).toHaveLength(2)
      expect(radios[0].attributes('checked')).toBeDefined()
      expect(radios[0].attributes('accessible-label')).toBe('Ja')

      radios[1].element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toBe('nee')

      // A change reporting "unchecked" is the outgoing option; it must not clear.
      radios[0].element.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toBe('nee')
    })

    it('handles an option with a null/empty value and omits aria-labelledby without a label', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [{ value: null, label: 'Onbekend' }],
        }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.findAll('nldd-radio-button-field')).toHaveLength(1)
      expect(wrapper.find('nldd-radio-button-group').attributes('accessible-labeled-by')).toBeUndefined()
    })
  })

  describe('select_option field', () => {
    it('renders the select slotted in an nldd-dropdown and writes the selection back to the store', async () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['select_option'],
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
        label: 'Kies',
      })
      expect(wrapper.find('nldd-dropdown').exists()).toBe(true)
      const select = wrapper.find('nldd-dropdown select')
      expect(select.exists()).toBe(true)
      expect(select.attributes('id')).toBe('field-1.1-1.1[0]')
      expect(select.attributes('aria-labelledby')).toBe('label-1.1-1.1[0]')
      const options = wrapper.findAll('option')
      expect(options).toHaveLength(3)
      expect(options[0].text()).toBe('Selecteer een optie')

      await select.setValue('b')
      await select.trigger('input')
      expect(answerStore.getAnswer('1.1[0]')).toBe('b')
    })

    it('renders the option key fallback for a null value option without a label', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['select_option'],
          options: [{ value: null }],
        }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.findAll('option')).toHaveLength(2)
      expect(wrapper.find('select').attributes('aria-labelledby')).toBeUndefined()
    })
  })

  describe('checkbox_option field', () => {
    it('renders options from task.options and toggles selection on/off', async () => {
      answerStore.setAnswer('1.1[0]', ['email'])
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [
            { value: 'email', label: 'E-mail' },
            { value: 'telefoon', label: 'Telefoon' },
          ],
        }),
        instanceId: '1.1[0]',
        label: 'Gegevens',
      })
      expect(wrapper.find('div.form-field__choices').exists()).toBe(true)
      expect(wrapper.findAll('label.form-field__choice')).toHaveLength(2)
      const boxes = wrapper.findAll('.form-field__choice nldd-checkbox')
      expect(boxes).toHaveLength(2)
      expect(boxes[0].attributes('checked')).toBeDefined()
      expect(boxes[1].attributes('checked')).toBeUndefined()

            boxes[1].element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['email', 'telefoon'])

            boxes[0].element.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['telefoon'])
    })

    it('starts from an empty array when there is no stored answer', async () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'x' }],
        }),
        instanceId: 'fresh[0]',
        label: 'Keuze',
      })
      const box = wrapper.find('.form-field__choice nldd-checkbox')
            box.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('fresh[0]')).toEqual(['x'])
    })

    it('handles an option with a null value via safeString', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: null }],
        }),
        instanceId: '1.1[0]',
      })
      const box = wrapper.find('.form-field__choice nldd-checkbox')
      expect(box.exists()).toBe(true)
      // safeString(null) -> empty string; the field carries it as its value.
      expect(box.attributes('value')).toBe('')
    })
  })

  describe('checkbox_option with source options', () => {
    const sourceTaskTree: Task[] = [
      {
        id: '2',
        task: 'Bron',
        type: ['task_group'],
        repeatable: true,
        tasks: [{ id: '2.1', task: 'Categorie', type: ['text_input'] }],
      },
    ]

    it('renders checkboxes from getSourceOptions and reflects selection', async () => {
      taskStore.init(sourceTaskTree, true)
      answerStore.setAnswer('2.1[0]', 'Klanten')

      const checkboxTask = flatTask({
        id: '3.1',
        type: ['checkbox_option'],
        valueType: 'string[]',
        dependencies: [
          { type: 'source_options', action: 'fill', condition: { id: '2.1', operator: 'eq' } },
        ],
      })
      answerStore.setAnswer('3.1[0]', ['Klanten'])

      const wrapper = mountField({
        task: checkboxTask,
        instanceId: '3.1[0]',
        label: 'Categorieën',
      })
      // Source options are the reader's own free text: plain, so the design
      // system's field carries them.
      const boxes = wrapper.findAll('nldd-checkbox-field')
      expect(boxes).toHaveLength(1)
      expect(boxes[0].attributes('checked')).toBeDefined()

      boxes[0].element.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('3.1[0]')).toEqual([])
    })
  })

  describe('checkbox_option with no options shows a dependency error', () => {
    const tree: Task[] = [
      { id: '5', task: 'Sectie vijf', type: ['task_group'], tasks: [{ id: '5.1', task: 'Iets', type: ['text_input'] }] },
      { id: '0', task: 'Inleiding', type: ['task_group'], tasks: [{ id: '0.1', task: 'Iets', type: ['text_input'] }] },
    ]

    it('shows the section-named error when source section id is not in the exempt list', () => {
      taskStore.init(tree, true)
      const checkboxTask = flatTask({
        id: '6.1',
        type: ['checkbox_option'],
        dependencies: [
          { type: 'source_options', action: 'fill', condition: { id: '5.1', operator: 'eq' } },
        ],
      })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]', label: 'Cat' })
      const err = wrapper.find('nldd-inline-dialog.form-field__dependency')
      expect(err.exists()).toBe(true)
      expect(err.attributes('supporting-text')).toContain('Vul eerst sectie 5')
      expect(err.attributes('supporting-text')).toContain('Sectie vijf')
    })

    it('shows the generic error when source section id is in the exempt list', () => {
      taskStore.init(tree, true)
      const checkboxTask = flatTask({
        id: '6.1',
        type: ['checkbox_option'],
        dependencies: [
          { type: 'source_options', action: 'fill', condition: { id: '0.1', operator: 'eq' } },
        ],
      })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]', label: 'Cat' })
      const err = wrapper.find('nldd-inline-dialog.form-field__dependency')
      expect(err.exists()).toBe(true)
      expect(err.attributes('supporting-text')).toContain('Vul eerst sectie "')
      expect(err.attributes('supporting-text')).not.toContain('sectie 0')
      expect(err.attributes('supporting-text')).toContain('Inleiding')
    })

    it('renders an empty dependency name when the source task does not exist', () => {
      const checkboxTask = flatTask({
        id: '6.1',
        type: ['checkbox_option'],
        dependencies: [
          { type: 'source_options', action: 'fill', condition: { id: '9.1', operator: 'eq' } },
        ],
      })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]' })
      const err = wrapper.find('nldd-inline-dialog.form-field__dependency')
      expect(err.exists()).toBe(true)
      expect(err.attributes('supporting-text')).toContain('Vul eerst sectie 9')
      expect(err.attributes('supporting-text')).toContain('""')
    })

    it('renders the generic-but-empty error when there are no dependencies at all', () => {
      const checkboxTask = flatTask({ id: '6.1', type: ['checkbox_option'] })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]' })
      const err = wrapper.find('nldd-inline-dialog.form-field__dependency')
      expect(err.exists()).toBe(true)
      expect(err.attributes('supporting-text')).toContain('Vul eerst sectie')
    })
  })

  describe('date field', () => {
    it('renders an NLDD date field with the ISO value and writes change events back to the store', async () => {
      answerStore.setAnswer('1.1[0]', '2026-01-01')
      const wrapper = mountField({
        task: flatTask({ type: ['date'] }),
        instanceId: '1.1[0]',
        label: 'Datum',
      })
      const field = wrapper.find('nldd-date-field')
      expect(field.exists()).toBe(true)
      expect(wrapper.find('input[type="date"]').exists()).toBe(false)
      expect(field.attributes('input-id')).toBe('field-1.1-1.1[0]')
      expect(field.attributes('accessible-label')).toBe('Datum')
      expect(field.attributes('aria-labelledby')).toBeUndefined()
      expect(field.attributes('value')).toBe('2026-01-01')

      // Typed commits and calendar picks both arrive as a change CustomEvent
      // with the ISO date (or '') in detail.value.
      field.element.dispatchEvent(new CustomEvent('change', { detail: { value: '2026-02-02' } }))
      expect(answerStore.getAnswer('1.1[0]')).toBe('2026-02-02')
      await nextTick()
      expect(field.attributes('value')).toBe('2026-02-02')

      // '' (cleared or unparseable input) reads back as an empty answer.
      field.element.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }))
      expect(answerStore.getAnswer('1.1[0]')).toBeNull()
    })

    it('falls back to event.target.value when a change event carries no detail', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['date'] }),
        instanceId: '1.1[0]',
        label: 'Datum',
      })
      const host = wrapper.find('nldd-date-field').element as HTMLElement & { value?: string }
      host.value = '2026-03-03'
      host.dispatchEvent(new Event('change'))
      expect(answerStore.getAnswer('1.1[0]')).toBe('2026-03-03')
    })
  })

  describe('image field', () => {
    it('delegates to ImageField for the image type', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['image'] }),
        instanceId: '1.1[0]',
        label: 'Afbeelding',
      })
      expect(wrapper.find('.image-field-stub').exists()).toBe(true)
    })
  })

  describe('currentValue: boolean valueType and defaults', () => {
    it('converts a stored "true"/"false" string for a boolean valueType radio', () => {
      answerStore.setAnswer('1.1[0]', 'true')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean',
          options: [
            { value: true as unknown as string, label: 'Ja' },
            { value: false as unknown as string, label: 'Nee' },
          ],
        }),
        instanceId: '1.1[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[0].attributes('checked')).toBeDefined()
    })

    it('uses a string defaultValue converted to boolean when no answer stored', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean|null',
          defaultValue: 'false',
          options: [
            { value: true as unknown as string, label: 'Ja' },
            { value: false as unknown as string, label: 'Nee' },
          ],
        }),
        instanceId: 'nostore[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[1].attributes('checked')).toBeDefined()
    })

    it('uses a non-string boolean defaultValue directly when no answer stored', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean',
          defaultValue: true,
          options: [
            { value: true as unknown as string, label: 'Ja' },
            { value: false as unknown as string, label: 'Nee' },
          ],
        }),
        instanceId: 'nostore2[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[0].attributes('checked')).toBeDefined()
    })

    it('converts the literal string "null" to null for a boolean|null valueType', () => {
      answerStore.setAnswer('1.1[0]', 'null')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean|null',
          options: [
            { value: true as unknown as string, label: 'Ja' },
            { value: false as unknown as string, label: 'Nee' },
          ],
        }),
        instanceId: '1.1[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[0].attributes('checked')).toBeUndefined()
      expect(radios[1].attributes('checked')).toBeUndefined()
    })

    it('keeps a non-boolean string value as a string for a boolean valueType', () => {
      answerStore.setAnswer('1.1[0]', 'misschien')
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean',
          options: [{ value: 'misschien', label: 'Misschien' }],
        }),
        instanceId: '1.1[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[0].attributes('checked')).toBeDefined()
    })
  })

  describe('currentValue: string[] valueType', () => {
    it('wraps a single stored string into an array', () => {
      answerStore.setAnswer('1.1[0]', 'email')
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'email' }, { value: 'telefoon' }],
        }),
        instanceId: '1.1[0]',
      })
      const boxes = wrapper.findAll('.form-field__choice nldd-checkbox')
      expect(boxes[0].attributes('checked')).toBeDefined()
      expect(boxes[1].attributes('checked')).toBeUndefined()
    })

    it('uses an empty array when there is no stored answer for a string[] field', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'email' }],
        }),
        instanceId: 'none[0]',
      })
      const boxes = wrapper.findAll('.form-field__choice nldd-checkbox')
      expect(boxes[0].attributes('checked')).toBeUndefined()
    })

    it('keeps an already-array stored value as-is for a string[] field', () => {
      answerStore.setAnswer('1.1[0]', ['telefoon'])
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'email' }, { value: 'telefoon' }],
        }),
        instanceId: '1.1[0]',
      })
      const boxes = wrapper.findAll('.form-field__choice nldd-checkbox')
      expect(boxes[1].attributes('checked')).toBeDefined()
    })
  })

  describe('currentValue: pre-scan referenced value', () => {
    const prescanTree: Task[] = [
      {
        id: '0',
        task: 'Pre-scan sectie',
        type: ['task_group'],
        tasks: [
          {
            id: '0.1',
            task: 'Naam',
            type: ['text_input'],
            references: {
              DPIA: [{ id: '1.1', type: 'pre-fill' }],
            },
          },
        ],
      },
    ]

    it('stores and returns the referenced pre-scan value when no DPIA answer exists', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)
      taskStore.init(prescanTree, true)
      answerStore.setAnswer('0.1', 'Geref. waarde')

      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.setActiveNamespace(FormType.DPIA)

      const wrapper = mountField({
        task: flatTask({ id: '1.1', type: ['text_input'] }),
        instanceId: '1.1',
        label: 'Naam',
      })
      expect(wrapper.find('nldd-text-field').attributes('value')).toBe('Geref. waarde')
      expect(answerStore.getAnswer('1.1')).toBe('Geref. waarde')
    })
  })

  describe('hasType with an undefined type array', () => {
    it('renders nothing (falls through) when task.type is undefined', () => {
      const wrapper = mountField({
        // `type` is deliberately omitted to exercise the optional-chaining branch in hasType.
        task: { id: '1.1', task: 'Een taak zonder type', parentId: null, childrenIds: [] } as unknown as FlatTask,
        instanceId: '1.1[0]',
        label: 'Zonder type',
      })
      expect(wrapper.find('div.form-field__label label').exists()).toBe(true)
      expect(wrapper.find('nldd-text-field').exists()).toBe(false)
      expect(wrapper.find('nldd-text-editor').exists()).toBe(false)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('select').exists()).toBe(false)
    })
  })

  describe('currentValue: convertStringValue null path', () => {
    it('returns null when a boolean field has no answer and no default', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          valueType: 'boolean',
          options: [
            { value: true as unknown as string, label: 'Ja' },
            { value: false as unknown as string, label: 'Nee' },
          ],
        }),
        instanceId: 'novalue[0]',
      })
      const radios = wrapper.findAll('nldd-radio-button-field')
      expect(radios[0].attributes('checked')).toBeUndefined()
      expect(radios[1].attributes('checked')).toBeUndefined()
    })
  })

  describe('currentValue: defaultValue with a non-boolean valueType', () => {
    it('does not apply the default-value branch for a string[] field', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          defaultValue: 'iets',
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: 'defstr[0]',
      })
      const boxes = wrapper.findAll('.form-field__choice nldd-checkbox')
      expect(boxes[0].attributes('checked')).toBeUndefined()
      expect(boxes[1].attributes('checked')).toBeUndefined()
    })
  })

  describe('handleCheckboxInput when currentValue is not an array', () => {
    it('starts from an empty array when the stored value is a plain string', async () => {
      answerStore.setAnswer('1.1[0]', 'losse-string')
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
      })
      const box = wrapper.findAll('.form-field__choice nldd-checkbox')[0]
            box.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['a'])
    })

    it('leaves the selection unchanged when re-checking an already-selected box', async () => {
      answerStore.setAnswer('1.1[0]', ['a'])
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
      })
      const box = wrapper.findAll('.form-field__choice nldd-checkbox')[0]
            box.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['a'])
    })
  })

  describe('accessible naming without a label', () => {
    it('editor has no accessible-label when there is no label', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('nldd-text-editor').attributes('accessible-label')).toBeUndefined()
    })

    it('date field has no accessible-label when there is no label', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['date'] }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('nldd-date-field').attributes('accessible-label')).toBeUndefined()
    })
  })

  describe('accessibleLabel: begrippen-tooltips are stripped', () => {
    it('passes the plain label text without definition markup as accessible-label', () => {
      const wrapper = mountField({
        task: flatTask(),
        instanceId: '1.1[0]',
        label: 'Naam <span class="aiv-definition">verwerking<span class="aiv-definition-text">uitleg over verwerking</span></span>',
      })
      expect(wrapper.find('nldd-text-field').attributes('accessible-label')).toBe('Naam verwerking')
    })
  })

  describe('displayLabel: prefixQuestionIds', () => {
    it('prefixes the label with the task id when the schema enables prefixQuestionIds and the task is official', async () => {
      const { useSchemaStore } = await import('../../src/stores/schemas')
      const schemaStore = useSchemaStore()
      schemaStore.init({
        dpia: {
          name: 'DPIA',
          urn: 'urn:nl:dpia',
          version: '3.0',
          description: 'x',
          tasks: [],
          prefixQuestionIds: true,
        },
        preScan: { name: 'P', urn: 'urn:nl:prescan', version: '2.0', description: 'x', tasks: [] },
        iama: { name: 'I', urn: 'urn:nl:iama', version: '1.0', description: 'x', tasks: [] },
      })

      const wrapper = mountField({
        task: flatTask({ id: '2.3', is_official_id: true }),
        instanceId: '2.3[0]',
        label: 'Mijn vraag',
      })
      const label = wrapper.find('div.form-field__label label')
      expect(label.element.innerHTML).toContain('2.3 Mijn vraag')
      expect(wrapper.find('nldd-text-field').attributes('accessible-label')).toBe('2.3 Mijn vraag')
    })

    it('does NOT prefix the label when the task is explicitly is_official_id: false', async () => {
      const { useSchemaStore } = await import('../../src/stores/schemas')
      const schemaStore = useSchemaStore()
      schemaStore.init({
        dpia: {
          name: 'DPIA',
          urn: 'urn:nl:dpia',
          version: '3.0',
          description: 'x',
          tasks: [],
          prefixQuestionIds: true,
        },
        preScan: { name: 'P', urn: 'urn:nl:prescan', version: '2.0', description: 'x', tasks: [] },
        iama: { name: 'I', urn: 'urn:nl:iama', version: '1.0', description: 'x', tasks: [] },
      })

      const wrapper = mountField({
        task: flatTask({ id: '2.3', is_official_id: false }),
        instanceId: '2.3[0]',
        label: 'Mijn vraag',
      })
      const label = wrapper.find('div.form-field__label label')
      expect(label.element.innerHTML).toContain('Mijn vraag')
      expect(label.element.innerHTML).not.toContain('2.3 Mijn vraag')
    })
  })

  describe('multiselect_scrollable rendering', () => {
    it('renders one checkbox per option for a multiselect_scrollable field', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['multiselect_scrollable'],
          options: [{ value: 'Optie A' }, { value: 'Optie B' }, { value: 'Optie C' }],
        }),
        instanceId: 'ms[0]',
        label: 'Kies opties',
      })
      expect(wrapper.find('.multiselect-scrollable').exists()).toBe(true)
      // Plain option values, so the design system's field carries the label.
      const checkboxes = wrapper.findAll('nldd-checkbox-field.multiselect-scrollable__option')
      expect(checkboxes).toHaveLength(3)
      expect(checkboxes.map((c) => c.attributes('label'))).toEqual(['Optie A', 'Optie B', 'Optie C'])
    })

    it('adds and removes a multiselect option through the field change event', async () => {
      answerStore.setAnswer('ms3[0]', ['Optie A'])
      const wrapper = mountField({
        task: flatTask({
          type: ['multiselect_scrollable'],
          valueType: 'string[]',
          options: [{ value: 'Optie A' }, { value: 'Optie B' }],
        }),
        instanceId: 'ms3[0]',
      })
      const boxes = wrapper.findAll('nldd-checkbox-field')

      boxes[1].element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('ms3[0]')).toEqual(['Optie A', 'Optie B'])

      boxes[0].element.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('ms3[0]')).toEqual(['Optie B'])

      // The inner checkbox re-emits across the shadow boundary: a duplicate
      // carrying the same state must not add the value twice.
      boxes[1].element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('ms3[0]')).toEqual(['Optie B'])

      // A change without a payload says nothing, so the answer stands.
      await boxes[1].trigger('change')
      expect(answerStore.getAnswer('ms3[0]')).toEqual(['Optie B'])
    })

    it('starts from an empty list when the field has no stored answer yet', async () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['multiselect_scrollable'],
          valueType: 'string[]',
          options: [{ value: 'Optie A' }],
        }),
        instanceId: 'msleeg[0]',
      })
      wrapper.find('nldd-checkbox-field').element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await wrapper.vm.$nextTick()
      expect(answerStore.getAnswer('msleeg[0]')).toEqual(['Optie A'])
    })

    it('checks the option that is present in the current array answer (Array.isArray && includes branch)', () => {
      answerStore.setAnswer('ms2[0]', ['Optie B'])

      const wrapper = mountField({
        task: flatTask({
          type: ['multiselect_scrollable'],
          valueType: 'string[]',
          options: [{ value: 'Optie A' }, { value: 'Optie B' }],
        }),
        instanceId: 'ms2[0]',
        label: 'Kies opties',
      })
      const boxes = wrapper.findAll('nldd-checkbox-field')
      expect(boxes[0].attributes('checked')).toBeUndefined()
      expect(boxes[1].attributes('checked')).toBeDefined()
    })
  })

  describe('currentValue: string defaultValue for a non-boolean field', () => {
    it('returns the string default when there is no stored answer (else-if string branch)', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['text_input'], defaultValue: 'standaardtekst' }),
        instanceId: 'defstr2[0]',
        label: 'Met default',
      })
      expect(wrapper.find('nldd-text-field').attributes('value')).toBe('standaardtekst')
    })
  })

  describe('currentValue: non-string defaultValue for a non-boolean field', () => {
    it('does not apply the string default branch when defaultValue is not a string (else-if false)', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['multiselect_scrollable'],
          valueType: 'string[]',
          // Non-string, non-boolean default: the `else if typeof === 'string'`
          // condition is false, so no default is returned.
          defaultValue: ['voorgevuld'] as unknown as string,
          options: [{ value: 'voorgevuld' }, { value: 'ander' }],
        }),
        instanceId: 'nonstrdef[0]',
      })
      const boxes = wrapper.findAll('nldd-checkbox-field')
      // No default applied -> nothing checked; the reader makes the choice.
      expect(boxes.map((b) => b.attributes('checked'))).toEqual([undefined, undefined])
    })
  })

  describe('FRIA tag (task.in_fria)', () => {
    it('renders the art. 27 AI-verordening tag link when the task is in_fria', () => {
      const wrapper = mountField({
        task: flatTask({ in_fria: true }),
        instanceId: '1.1[0]',
        label: 'Met FRIA',
      })
      const tag = wrapper.find('a.form-field__fria-tag')
      expect(tag.exists()).toBe(true)
      expect(tag.text()).toContain('art. 27 AI-verordening')
      expect(tag.attributes('rel')).toBe('noopener noreferrer')
      const icon = tag.find('nldd-icon')
      expect(icon.exists()).toBe(true)
      expect(icon.attributes('name')).toBe('square-arrow-right-top')
      expect(icon.attributes('size')).toBe('16')
      expect(icon.attributes('aria-label')).toBe('Opent in nieuw tabblad')
    })

    it('does not render the FRIA tag when the task is not in_fria', () => {
      const wrapper = mountField({
        task: flatTask({ in_fria: false }),
        instanceId: '1.1[0]',
        label: 'Zonder FRIA',
      })
      expect(wrapper.find('a.form-field__fria-tag').exists()).toBe(false)
    })
  })

  describe('displayLabel with an absent label (defensive !label branch)', () => {
    it('returns the (falsy) label unchanged when no label is provided', () => {
      const wrapper = mountField({ task: flatTask(), instanceId: '1.1[0]' })
      // displayLabel is only read in-template behind v-if="label"; read it directly
      // to exercise the early `if (!props.label) return props.label` guard.
      const vm = wrapper.vm as unknown as { displayLabel: string | undefined }
      expect(vm.displayLabel).toBeUndefined()
    })
  })

  describe('read-only role', () => {
    it('makes the input inert and leaves the label alone', () => {
      const wrapper = mountField(
        { task: flatTask(), instanceId: '1.1[0]', label: 'Een <span class="aiv-definition">term</span>' },
        true,
      )
      expect(wrapper.find('.field-group').attributes('inert')).toBeDefined()
      expect(wrapper.find('.form-field__label').attributes('inert')).toBeUndefined()
    })

    it('leaves the input interactive for an editor', () => {
      const wrapper = mountField({ task: flatTask(), instanceId: '1.1[0]' })
      expect(wrapper.find('.field-group').attributes('inert')).toBeUndefined()
    })

    it('makes the open-text area inert', () => {
      const wrapper = mountField(
        { task: flatTask({ type: ['open_text'] }), instanceId: '1.1[0]' },
        true,
      )
      expect(wrapper.find('nldd-text-editor').attributes('inert')).toBeDefined()
    })
  })
})

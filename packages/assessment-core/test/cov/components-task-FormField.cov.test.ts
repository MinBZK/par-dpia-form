import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useTaskStore, type FlatTask } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'
import FormField from '../../src/components/task/FormField.vue'

// Build a FlatTask directly so each prop combination (type, valueType,
// defaultValue, dependencies, options, references) can be controlled precisely.
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

function mountField(props: MountProps) {
  return mount(FormField, {
    props,
    global: {
      // Stub ImageField so the `image` branch can render without dragging in
      // the whole image-upload component.
      stubs: {
        ImageField: { name: 'ImageField', props: ['task', 'instanceId', 'label', 'description'], template: '<div class="image-field-stub" />' },
      },
    },
  })
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
      const label = wrapper.find('label.rvo-label')
      expect(label.exists()).toBe(true)
      expect(label.attributes('id')).toBe('label-1.1-1.1[0]')
      expect(label.element.innerHTML).toContain('Mijn label')
      const desc = wrapper.find('.utrecht-form-field-description')
      expect(desc.exists()).toBe(true)
      expect(desc.attributes('id')).toBe('description-1.1-1.1[0]')
      expect(desc.element.innerHTML).toContain('Mijn omschrijving')
    })

    it('omits the label block entirely when no label is given', () => {
      const wrapper = mountField({ task: flatTask(), instanceId: '1.1[0]' })
      expect(wrapper.find('label.rvo-label').exists()).toBe(false)
      // aria-labelledby falls back to undefined when there is no label
      expect(wrapper.find('input[type="text"]').attributes('aria-labelledby')).toBeUndefined()
    })

    it('renders the open_text read/edit toggle and switches preview on click', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      const toggle = wrapper.find('button.open-text-field__toggle')
      expect(toggle.exists()).toBe(true)
      // initial: not previewing -> shows "Lezen" and edit textarea visible
      expect(toggle.text()).toContain('Lezen')
      expect(toggle.attributes('aria-pressed')).toBe('false')
      expect(toggle.attributes('aria-label')).toBe('Lezen')
      expect(wrapper.find('textarea').exists()).toBe(true)
      expect(wrapper.find('.markdown-preview').exists()).toBe(false)

      await toggle.trigger('click')
      // now previewing -> shows "Bewerken" and the markdown preview region
      expect(toggle.text()).toContain('Bewerken')
      expect(toggle.attributes('aria-pressed')).toBe('true')
      expect(toggle.attributes('aria-label')).toBe('Bewerken')
      expect(wrapper.find('textarea').exists()).toBe(false)
      const preview = wrapper.find('.markdown-preview')
      expect(preview.exists()).toBe(true)
      expect(preview.attributes('aria-label')).toBe('Voorbeeld van de opmaak')
    })

    it('does not render the toggle button when the field is not open_text', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['text_input'] }),
        instanceId: '1.1[0]',
        label: 'Naam',
      })
      expect(wrapper.find('button.open-text-field__toggle').exists()).toBe(false)
    })
  })

  describe('renderedHtml and preview watcher', () => {
    it('renders markdown to HTML in the preview and restores the textarea on switch back', async () => {
      answerStore.setAnswer('1.1[0]', '**vet** tekst')
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      const toggle = wrapper.find('button.open-text-field__toggle')

      // Enter preview: renderedHtml uses currentValue (the stored answer)
      await toggle.trigger('click')
      const preview = wrapper.find('.markdown-preview')
      expect(preview.element.innerHTML).toContain('<strong>vet</strong>')

      // Switch back to edit: watcher runs autoGrow + focus on the textarea
      await toggle.trigger('click')
      await nextTick()
      expect(wrapper.find('textarea').exists()).toBe(true)
    })

    it('renders an empty preview when there is no value', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: 'empty[0]',
        label: 'Toelichting',
      })
      await wrapper.find('button.open-text-field__toggle').trigger('click')
      expect(wrapper.find('.markdown-preview').element.innerHTML.trim()).toBe('')
    })

    it('renderedHtml yields an empty string while not in preview mode', async () => {
      // The renderedHtml computed short-circuits to '' whenever showPreview is
      // false, so markdown is not rendered while the editor textarea is shown.
      // Read the computed through the mounted component instance (with a stored
      // value present) to exercise that not-previewing branch directly.
      answerStore.setAnswer('1.1[0]', '**vet** tekst')
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      // showPreview defaults to false -> the textarea is shown, no preview region.
      expect(wrapper.find('textarea').exists()).toBe(true)
      expect(wrapper.find('.markdown-preview').exists()).toBe(false)
      const setupState = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
      expect(setupState.renderedHtml).toBe('')
    })
  })

  describe('text_input field', () => {
    it('renders the stored value and writes input back to the store', async () => {
      answerStore.setAnswer('1.1[0]', 'bestaande waarde')
      const wrapper = mountField({
        task: flatTask({ type: ['text_input'] }),
        instanceId: '1.1[0]',
        label: 'Naam',
      })
      const input = wrapper.find('input[type="text"]')
      expect((input.element as HTMLInputElement).value).toBe('bestaande waarde')
      expect(input.attributes('aria-labelledby')).toBe('label-1.1-1.1[0]')

      await input.setValue('nieuwe waarde')
      await input.trigger('input')
      expect(answerStore.getAnswer('1.1[0]')).toBe('nieuwe waarde')
    })
  })

  describe('open_text textarea input', () => {
    it('writes textarea input back to the store and auto-grows', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      const textarea = wrapper.find('textarea')
      await textarea.setValue('regel een\nregel twee')
      await textarea.trigger('input')
      expect(answerStore.getAnswer('1.1[0]')).toBe('regel een\nregel twee')
    })
  })

  describe('radio_option field', () => {
    it('renders options, marks the selected one and updates on change', async () => {
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
      const radios = wrapper.findAll('input[type="radio"]')
      expect(radios).toHaveLength(2)
      expect((radios[0].element as HTMLInputElement).checked).toBe(true)
      expect((radios[1].element as HTMLInputElement).checked).toBe(false)

      await radios[1].trigger('change')
      expect(answerStore.getAnswer('1.1[0]')).toBe('nee')
    })

    it('handles an option with a null/empty value in the key fallback', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['radio_option'],
          options: [{ value: null, label: 'Onbekend' }],
        }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.findAll('input[type="radio"]')).toHaveLength(1)
    })
  })

  describe('select_option field', () => {
    it('renders options and writes the selection back to the store', async () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['select_option'],
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
        label: 'Kies',
      })
      const select = wrapper.find('select')
      expect(select.exists()).toBe(true)
      expect(select.attributes('aria-labelledby')).toBe('label-1.1-1.1[0]')
      // placeholder + 2 options
      expect(wrapper.findAll('option')).toHaveLength(3)

      await select.setValue('b')
      await select.trigger('input')
      expect(answerStore.getAnswer('1.1[0]')).toBe('b')
    })

    it('renders the option key fallback for a null value option', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['select_option'],
          options: [{ value: null }],
        }),
        instanceId: '1.1[0]',
      })
      // placeholder + 1 null-value option
      expect(wrapper.findAll('option')).toHaveLength(2)
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
      const boxes = wrapper.findAll('input[type="checkbox"]')
      expect(boxes).toHaveLength(2)
      expect((boxes[0].element as HTMLInputElement).checked).toBe(true)
      expect((boxes[1].element as HTMLInputElement).checked).toBe(false)

      // Check the second box -> added
      ;(boxes[1].element as HTMLInputElement).checked = true
      await boxes[1].trigger('change')
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['email', 'telefoon'])

      // Uncheck the first box -> removed
      ;(boxes[0].element as HTMLInputElement).checked = false
      await boxes[0].trigger('change')
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
      const box = wrapper.find('input[type="checkbox"]')
      ;(box.element as HTMLInputElement).checked = true
      await box.trigger('change')
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
      // safeString(null) -> '' so id ends with empty suffix; one checkbox renders
      const box = wrapper.find('input[type="checkbox"]')
      expect(box.exists()).toBe(true)
      expect(box.attributes('id')).toBe('1.1-1.1[0]-')
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
      // Provide a source answer that becomes a checkbox option
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
      const boxes = wrapper.findAll('input[type="checkbox"]')
      expect(boxes).toHaveLength(1)
      expect((boxes[0].element as HTMLInputElement).checked).toBe(true)

      ;(boxes[0].element as HTMLInputElement).checked = false
      await boxes[0].trigger('change')
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
      const err = wrapper.find('.rvo-text--error')
      expect(err.exists()).toBe(true)
      // sourceId '5' not in ['0','18','19','20'] -> shows "Vul eerst sectie 5 ..."
      expect(err.text()).toContain('Vul eerst sectie 5')
      // dependencyTaskName resolves to the source task title 'Sectie vijf'
      expect(err.text()).toContain('Sectie vijf')
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
      const err = wrapper.find('.rvo-text--error')
      expect(err.exists()).toBe(true)
      // sourceId '0' is exempt -> generic message without the section number
      expect(err.text()).toContain('Vul eerst sectie "')
      expect(err.text()).not.toContain('sectie 0')
      expect(err.text()).toContain('Inleiding')
    })

    it('renders an empty dependency name when the source task does not exist', () => {
      // No tasks initialised, so taskById throws and dependencyTaskName catches -> ''
      const checkboxTask = flatTask({
        id: '6.1',
        type: ['checkbox_option'],
        dependencies: [
          { type: 'source_options', action: 'fill', condition: { id: '9.1', operator: 'eq' } },
        ],
      })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]' })
      const err = wrapper.find('.rvo-text--error')
      expect(err.exists()).toBe(true)
      expect(err.text()).toContain('Vul eerst sectie 9')
      // dependencyTaskName is '' (catch branch) -> quotes are empty
      expect(err.text()).toContain('""')
    })

    it('renders the generic-but-empty error when there are no dependencies at all', () => {
      // getSourceTaskId returns '' (sourceIdWithPath is null), so the exempt
      // list check `['0',...].includes('')` is false -> section-named branch
      // with an empty section id and empty dependency name.
      const checkboxTask = flatTask({ id: '6.1', type: ['checkbox_option'] })
      const wrapper = mountField({ task: checkboxTask, instanceId: '6.1[0]' })
      const err = wrapper.find('.rvo-text--error')
      expect(err.exists()).toBe(true)
      expect(err.text()).toContain('Vul eerst sectie')
    })
  })

  describe('date field', () => {
    it('renders a date input and writes input back to the store', async () => {
      answerStore.setAnswer('1.1[0]', '2026-01-01')
      const wrapper = mountField({
        task: flatTask({ type: ['date'] }),
        instanceId: '1.1[0]',
        label: 'Datum',
      })
      const input = wrapper.find('input[type="date"]')
      expect(input.exists()).toBe(true)
      expect((input.element as HTMLInputElement).value).toBe('2026-01-01')

      await input.setValue('2026-02-02')
      await input.trigger('input')
      expect(answerStore.getAnswer('1.1[0]')).toBe('2026-02-02')
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
      const radios = wrapper.findAll('input[type="radio"]')
      // currentValue === true matches the first option (value true)
      expect((radios[0].element as HTMLInputElement).checked).toBe(true)
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
      const radios = wrapper.findAll('input[type="radio"]')
      expect((radios[1].element as HTMLInputElement).checked).toBe(true)
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
      const radios = wrapper.findAll('input[type="radio"]')
      expect((radios[0].element as HTMLInputElement).checked).toBe(true)
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
      const radios = wrapper.findAll('input[type="radio"]')
      // currentValue === null, so neither option is checked
      expect((radios[0].element as HTMLInputElement).checked).toBe(false)
      expect((radios[1].element as HTMLInputElement).checked).toBe(false)
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
      const radios = wrapper.findAll('input[type="radio"]')
      expect((radios[0].element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('currentValue: string[] valueType', () => {
    it('wraps a single stored string into an array', () => {
      answerStore.setAnswer('1.1[0]', 'one')
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'one' }, { value: 'two' }],
        }),
        instanceId: '1.1[0]',
      })
      const boxes = wrapper.findAll('input[type="checkbox"]')
      // 'one' wrapped to ['one'] -> first checkbox checked
      expect((boxes[0].element as HTMLInputElement).checked).toBe(true)
      expect((boxes[1].element as HTMLInputElement).checked).toBe(false)
    })

    it('uses an empty array when there is no stored answer for a string[] field', () => {
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'one' }],
        }),
        instanceId: 'none[0]',
      })
      const boxes = wrapper.findAll('input[type="checkbox"]')
      expect((boxes[0].element as HTMLInputElement).checked).toBe(false)
    })

    it('keeps an already-array stored value as-is for a string[] field', () => {
      answerStore.setAnswer('1.1[0]', ['two'])
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'one' }, { value: 'two' }],
        }),
        instanceId: '1.1[0]',
      })
      const boxes = wrapper.findAll('input[type="checkbox"]')
      expect((boxes[1].element as HTMLInputElement).checked).toBe(true)
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
      // Set up the pre-scan namespace with an answer to be referenced.
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)
      taskStore.init(prescanTree, true)
      answerStore.setAnswer('0.1', 'Geref. waarde')

      // Switch back to DPIA where the field lives.
      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.setActiveNamespace(FormType.DPIA)

      const wrapper = mountField({
        task: flatTask({ id: '1.1', type: ['text_input'] }),
        instanceId: '1.1',
        label: 'Naam',
      })
      const input = wrapper.find('input[type="text"]')
      expect((input.element as HTMLInputElement).value).toBe('Geref. waarde')
      // The referenced value was stored immediately in the DPIA answer store.
      expect(answerStore.getAnswer('1.1')).toBe('Geref. waarde')
    })
  })

  describe('hasType with an undefined type array', () => {
    it('renders nothing (falls through) when task.type is undefined', () => {
      const wrapper = mountField({
        // type cast: deliberately omit `type` to hit the `?.includes() || false`
        // optional-chaining branch in hasType.
        task: { id: '1.1', task: 'X', parentId: null, childrenIds: [] } as unknown as FlatTask,
        instanceId: '1.1[0]',
        label: 'Zonder type',
      })
      // The label still renders, but no field group/input is produced.
      expect(wrapper.find('label.rvo-label').exists()).toBe(true)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('select').exists()).toBe(false)
      expect(wrapper.find('textarea').exists()).toBe(false)
    })
  })

  describe('currentValue: convertStringValue null path', () => {
    it('returns null when a boolean field has no answer and no default', () => {
      // No stored answer, no defaultValue: currentValue falls through to the
      // boolean conversion at the bottom, calling convertStringValue(null, ...)
      // which hits the `value === null` early return.
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
      const radios = wrapper.findAll('input[type="radio"]')
      // currentValue === null -> neither radio checked
      expect((radios[0].element as HTMLInputElement).checked).toBe(false)
      expect((radios[1].element as HTMLInputElement).checked).toBe(false)
    })
  })

  describe('currentValue: defaultValue with a non-boolean valueType', () => {
    it('does not apply the default-value branch for a string[] field', () => {
      // defaultValue set + no stored answer + valueType not boolean: the inner
      // boolean check is false, so the default block is skipped and the string[]
      // branch produces an empty array.
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          defaultValue: 'iets',
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: 'defstr[0]',
      })
      const boxes = wrapper.findAll('input[type="checkbox"]')
      expect((boxes[0].element as HTMLInputElement).checked).toBe(false)
      expect((boxes[1].element as HTMLInputElement).checked).toBe(false)
    })
  })

  describe('handleCheckboxInput when currentValue is not an array', () => {
    it('starts from an empty array when the stored value is a plain string', async () => {
      // No string[] valueType: currentValue returns the raw stored string, so
      // Array.isArray(currentValue) is false -> the `: []` ternary branch runs.
      answerStore.setAnswer('1.1[0]', 'losse-string')
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
      })
      const box = wrapper.findAll('input[type="checkbox"]')[0]
      ;(box.element as HTMLInputElement).checked = true
      await box.trigger('change')
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['a'])
    })

    it('leaves the selection unchanged when re-checking an already-selected box', async () => {
      // isChecked true but the value is already present: the first `if` is false
      // (its !includes guard fails) and the else-if is also false (isChecked).
      answerStore.setAnswer('1.1[0]', ['a'])
      const wrapper = mountField({
        task: flatTask({
          type: ['checkbox_option'],
          valueType: 'string[]',
          options: [{ value: 'a' }, { value: 'b' }],
        }),
        instanceId: '1.1[0]',
      })
      const box = wrapper.findAll('input[type="checkbox"]')[0]
      ;(box.element as HTMLInputElement).checked = true
      await box.trigger('change')
      expect(answerStore.getAnswer('1.1[0]')).toEqual(['a'])
    })
  })

  describe('aria-labelledby fallback to undefined without a label', () => {
    it('open_text textarea has no aria-labelledby when there is no label', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('textarea').attributes('aria-labelledby')).toBeUndefined()
    })

    it('date input has no aria-labelledby when there is no label', () => {
      const wrapper = mountField({
        task: flatTask({ type: ['date'] }),
        instanceId: '1.1[0]',
      })
      expect(wrapper.find('input[type="date"]').attributes('aria-labelledby')).toBeUndefined()
    })
  })

  describe('onMounted and currentValue watcher auto-grow', () => {
    it('auto-grows the textarea on mount and when the value changes', async () => {
      const wrapper = mountField({
        task: flatTask({ type: ['open_text'] }),
        instanceId: '1.1[0]',
        label: 'Toelichting',
      })
      // onMounted ran autoGrowTextarea against textareaRef.
      await nextTick()
      expect(wrapper.find('textarea').exists()).toBe(true)

      // Changing the stored value triggers the currentValue watcher.
      answerStore.setAnswer('1.1[0]', 'nieuwe inhoud')
      await nextTick()
      await nextTick()
      expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('nieuwe inhoud')

      wrapper.unmount()
    })
  })
})

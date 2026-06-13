import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MarkdownEditor from '../../src/components/task/MarkdownEditor.vue'

describe('MarkdownEditor.vue', () => {
  it('renders the toolbar, toggle and textarea with the model value', () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: 'hallo' } })
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(true)
    expect(wrapper.find('button.open-text-field__toggle').text()).toContain('Lezen')
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('hallo')
  })

  it('emits update:modelValue when the textarea receives input', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '' } })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('nieuwe tekst')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['nieuwe tekst'])
  })

  it('shows the rendered preview when toggled and restores the textarea when toggled back', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '**vet**' } })
    const toggle = wrapper.find('button.open-text-field__toggle')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('textarea').exists()).toBe(false)
    const preview = wrapper.find('.markdown-preview')
    expect(preview.attributes('aria-label')).toBe('Voorbeeld van de opmaak')
    expect(preview.element.innerHTML).toContain('<strong>vet</strong>')
    // The toolbar is hidden while previewing.
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false)

    await toggle.trigger('click')
    await nextTick()
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renderedHtml is an empty string while editing', () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '**vet**' } })
    const setupState = (wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } }).$.setupState
    expect(setupState.renderedHtml).toBe('')
  })

  it('applies a toolbar command to the selection and emits the new markdown', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: 'abc' } })
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
    textarea.setSelectionRange(0, 3)
    await wrapper.find('button[aria-label="Vet"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['**abc**'])
    await nextTick()
  })

  it('passes inputId and aria-labelledby through to the textarea', () => {
    const wrapper = mount(MarkdownEditor, {
      props: { modelValue: '', inputId: 'field-1.1-1.1[0]', ariaLabelledby: 'label-1.1-1.1[0]' },
    })
    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('id')).toBe('field-1.1-1.1[0]')
    expect(textarea.attributes('aria-labelledby')).toBe('label-1.1-1.1[0]')
  })

  it('omits inputId and aria-labelledby when not provided', () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: '' } })
    const textarea = wrapper.find('textarea')
    expect(textarea.attributes('id')).toBeUndefined()
    expect(textarea.attributes('aria-labelledby')).toBeUndefined()
  })

  it('handles a model value change while previewing (no textarea mounted)', async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: 'een' } })
    await wrapper.find('button.open-text-field__toggle').trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    await wrapper.setProps({ modelValue: 'twee' })
    await nextTick()
    expect(wrapper.find('.markdown-preview').exists()).toBe(true)
  })
})

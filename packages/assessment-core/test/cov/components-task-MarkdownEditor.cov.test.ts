import { describe, it, expect, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MarkdownEditor from '../../src/components/task/MarkdownEditor.vue'

// jsdom has no layout engine; ProseMirror measures the DOM via Range.getClientRects
// during selection/link operations. Stub those layout calls so they don't throw.
beforeAll(() => {
  const proto = Range.prototype as unknown as Record<string, unknown>
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })
  }
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) })
  }
})

// Mount the editor and wait for the TipTap/ProseMirror instance to initialise
// (the .ProseMirror element appears once useEditor has mounted).
async function mountEditor(props: Record<string, unknown>) {
  const wrapper = mount(MarkdownEditor, { props, attachTo: document.body })
  for (let i = 0; i < 30 && !wrapper.find('.ProseMirror').exists(); i++) {
    await flushPromises()
  }
  return wrapper
}

describe('MarkdownEditor.vue (WYSIWYG)', () => {
  it('renders a contenteditable editor with a footer toolbar and formatted markdown', async () => {
    const wrapper = await mountEditor({ modelValue: '**vet** tekst', inputId: 'field-1', ariaLabelledby: 'label-1' })
    // Toolbar lives in the always-visible footer.
    expect(wrapper.find('.markdown-editor__footer [role="toolbar"]').exists()).toBe(true)
    const pm = wrapper.find('.ProseMirror')
    expect(pm.exists()).toBe(true)
    expect(pm.attributes('role')).toBe('textbox')
    expect(pm.attributes('aria-multiline')).toBe('true')
    expect(pm.attributes('id')).toBe('field-1')
    expect(pm.attributes('aria-labelledby')).toBe('label-1')
    expect(pm.html()).toContain('<strong>vet</strong>')
    wrapper.unmount()
  })

  it('omits id and aria-labelledby when those props are not given', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const pm = wrapper.find('.ProseMirror')
    expect(pm.attributes('id')).toBeUndefined()
    expect(pm.attributes('aria-labelledby')).toBeUndefined()
    wrapper.unmount()
  })

  it('applies toolbar commands and emits markdown when the document changes', async () => {
    const wrapper = await mountEditor({ modelValue: 'Hallo' })
    for (const label of ['Vet', 'Cursief', 'Opsommingslijst', 'Genummerde lijst', 'Kop']) {
      await wrapper.find(`button[aria-label="${label}"]`).trigger('click')
      await flushPromises()
    }
    const emits = wrapper.emitted('update:modelValue')
    expect(emits && emits.length).toBeGreaterThan(0)
    expect(typeof (emits!.at(-1)![0])).toBe('string')
    wrapper.unmount()
  })

  it('opens an inline link editor, applies a url, and clears on an empty submit', async () => {
    const wrapper = await mountEditor({ modelValue: 'Linktekst' })

    // Open the link bar via the toolbar.
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(true)

    // Apply a url (setLink branch).
    await wrapper.find('.markdown-editor__linkinput').setValue('https://example.org')
    await wrapper.find('.markdown-editor__linkform').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)

    // Open again and submit empty (unsetLink branch).
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    await wrapper.find('.markdown-editor__linkform').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)

    wrapper.unmount()
  })

  it('cancels the link editor without applying', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(true)
    // The "Annuleren" button is the non-submit button in the link form.
    await wrapper.find('.markdown-editor__linkbar button[type="button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('re-syncs on an external value change and ignores an echo of its own output', async () => {
    const wrapper = await mountEditor({ modelValue: 'Hallo' })
    await wrapper.find('button[aria-label="Kop"]').trigger('click')
    await flushPromises()
    const ownMarkdown = wrapper.emitted('update:modelValue')!.at(-1)![0] as string

    // Echo of the editor's own output → value equals getMarkdown() → no re-set.
    await wrapper.setProps({ modelValue: ownMarkdown })
    await flushPromises()

    // Genuinely different external value → setContent re-syncs the editor.
    await wrapper.setProps({ modelValue: '# Extern gewijzigd' })
    await flushPromises()
    expect(wrapper.find('.ProseMirror').text()).toContain('Extern gewijzigd')
    wrapper.unmount()
  })
})

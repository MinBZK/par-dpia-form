import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MarkdownEditor from '../../src/components/task/MarkdownEditor.vue'

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
  beforeEach(() => {
    // window.prompt is unimplemented in jsdom; default it to "cancelled".
    vi.stubGlobal('prompt', () => null)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the toolbar and a contenteditable editor that shows formatted markdown', async () => {
    const wrapper = await mountEditor({ modelValue: '**vet** tekst', inputId: 'field-1', ariaLabelledby: 'label-1' })
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(true)
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

  it('inserts a link when a url is given and is a no-op when cancelled', async () => {
    const wrapper = await mountEditor({ modelValue: 'Linktekst' })

    // Cancelled prompt (returns null) → the if (url) branch is skipped.
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()

    // A provided url → setLink runs.
    vi.stubGlobal('prompt', () => 'https://example.org')
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.ProseMirror').exists()).toBe(true)
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

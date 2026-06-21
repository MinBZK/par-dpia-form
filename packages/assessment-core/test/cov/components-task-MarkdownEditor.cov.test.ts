import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
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

async function mountEditor(props: Record<string, unknown>) {
  const wrapper = mount(MarkdownEditor, { props, attachTo: document.body })
  for (let i = 0; i < 30 && !wrapper.find('.ProseMirror').exists(); i++) {
    await flushPromises()
  }
  return wrapper
}

// The component exposes the editor; unwrap the ref regardless of how vm surfaces it.
function getEditor(wrapper: ReturnType<typeof mount>): Editor {
  const exposed = (wrapper.vm as unknown as { editor: Editor | { value: Editor } }).editor
  return 'getMarkdown' in exposed ? exposed : exposed.value
}

function linkButton(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('.markdown-editor__linkbar button').find((b) => b.text() === label)!
}

describe('MarkdownEditor.vue (WYSIWYG)', () => {
  it('renders a contenteditable editor with a footer toolbar and formatted markdown', async () => {
    const wrapper = await mountEditor({ modelValue: '**vet** tekst', inputId: 'field-1', ariaLabelledby: 'label-1', ariaLabel: 'Mijn veld' })
    expect(wrapper.find('.markdown-editor__footer [role="toolbar"]').exists()).toBe(true)
    const pm = wrapper.find('.ProseMirror')
    expect(pm.attributes('role')).toBe('textbox')
    expect(pm.attributes('aria-multiline')).toBe('true')
    expect(pm.attributes('id')).toBe('field-1')
    expect(pm.attributes('aria-labelledby')).toBe('label-1')
    expect(pm.attributes('aria-label')).toBe('Mijn veld')
    expect(pm.html()).toContain('<strong>vet</strong>')
    wrapper.unmount()
  })

  it('omits id, aria-labelledby and aria-label when those props are not given', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const pm = wrapper.find('.ProseMirror')
    expect(pm.attributes('id')).toBeUndefined()
    expect(pm.attributes('aria-labelledby')).toBeUndefined()
    expect(pm.attributes('aria-label')).toBeUndefined()
    wrapper.unmount()
  })

  it('applies every formatting command and emits markdown on a document change', async () => {
    const wrapper = await mountEditor({ modelValue: 'Hallo' })
    const labels = ['Vet', 'Cursief', 'Doorhalen', 'Opsommingslijst', 'Genummerde lijst', 'Citaat', 'Code', 'Scheidingslijn']
    for (const label of labels) {
      await wrapper.find(`button[aria-label="${label}"]`).trigger('click')
      await flushPromises()
    }
    const emits = wrapper.emitted('update:modelValue')
    expect(emits && emits.length).toBeGreaterThan(0)
    expect(typeof (emits!.at(-1)![0])).toBe('string')
    wrapper.unmount()
  })

  it('adds a new link via the inline bar and clears it on an empty submit', async () => {
    const wrapper = await mountEditor({ modelValue: 'Linktekst' })

    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(true)
    // A new link shows "Toevoegen" and no open/remove actions.
    expect(linkButton(wrapper, 'Toevoegen').exists()).toBe(true)
    expect(wrapper.findAll('.markdown-editor__linkbar button').some((b) => b.text() === 'Openen')).toBe(false)

    await wrapper.find('.markdown-editor__linkinput').setValue('https://example.org')
    await wrapper.find('.markdown-editor__linkform').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)

    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    await wrapper.find('.markdown-editor__linkinput').setValue('') // clear → empty submit removes the link
    await wrapper.find('.markdown-editor__linkform').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('edits an existing link: pre-fills the url, opens it, and removes it', async () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const editor = getEditor(wrapper)
    editor.commands.setContent('<p><a href="https://x.org">link</a></p>')
    editor.commands.setTextSelection(2) // inside the link
    await flushPromises()

    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    expect((wrapper.find('.markdown-editor__linkinput').element as HTMLInputElement).value).toBe('https://x.org')
    expect(linkButton(wrapper, 'Opslaan').exists()).toBe(true)

    // Openen → opens in a new tab.
    await linkButton(wrapper, 'Openen').trigger('click')
    expect(openSpy).toHaveBeenCalledWith('https://x.org', '_blank', 'noopener,noreferrer')

    // With an empty url, Openen is a no-op.
    await wrapper.find('.markdown-editor__linkinput').setValue('')
    await linkButton(wrapper, 'Openen').trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)

    // Verwijderen removes the link and closes the bar.
    await linkButton(wrapper, 'Verwijderen').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)

    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  it('cancels the link editor without applying', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    await wrapper.find('button[aria-label="Link"]').trigger('click')
    await flushPromises()
    await linkButton(wrapper, 'Annuleren').trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens a link in a new tab on Cmd/Ctrl+click via the editor handleClick', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const editor = getEditor(wrapper)
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const anchor = document.createElement('a')
    anchor.href = 'https://x.org'
    const event = new MouseEvent('click', { cancelable: true, metaKey: true })
    Object.defineProperty(event, 'target', { value: anchor })
    editor.view.someProp('handleClick', (handler: (...args: unknown[]) => boolean) => handler(editor.view, 1, event))
    expect(openSpy).toHaveBeenCalledWith('https://x.org/', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  it('applies and clears heading levels via the toolbar dropdown, and syncs the active level', async () => {
    const wrapper = await mountEditor({ modelValue: 'Titel', baseHeadingLevel: 2 })
    const select = wrapper.find('select.markdown-toolbar__heading')
    expect((select.element as HTMLSelectElement).value).toBe('') // starts as a paragraph

    await select.setValue('2') // Kop 1 = base = H2
    await flushPromises()
    expect(wrapper.find('.ProseMirror').html()).toContain('<h2')
    expect((select.element as HTMLSelectElement).value).toBe('2') // dropdown follows the cursor block

    await select.setValue('3') // Kop 2 = H3
    await flushPromises()
    expect(wrapper.find('.ProseMirror').html()).toContain('<h3')

    await select.setValue('') // back to a paragraph
    await flushPromises()
    const html = wrapper.find('.ProseMirror').html()
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('<h3')
    expect((select.element as HTMLSelectElement).value).toBe('')
    wrapper.unmount()
  })

  it('maps a #-shortcut relatively onto the field levels and caps at H6 (custom rule wins over built-ins)', async () => {
    const wrapper = await mountEditor({ modelValue: '', baseHeadingLevel: 2 })
    const editor = getEditor(wrapper)
    // Input rules fire on text input, not on programmatic inserts: put the hashes
    // in a paragraph, then drive the trailing space through handleTextInput.
    const headingTagFor = (hashes: string) => {
      editor.commands.setContent(`<p>${hashes}</p>`)
      editor.commands.focus('end')
      const view = editor.view
      const pos = view.state.selection.from
      view.someProp('handleTextInput', (handle: (...a: unknown[]) => boolean) => handle(view, pos, pos, ' '))
      return (view.dom.firstElementChild as HTMLElement).tagName
    }
    // One hash = base (H2), each extra hash one deeper, capped at H6. The divergent
    // cases (##→H3 etc.) also pin that the custom relative rule beats the heading
    // extension's built-in ABSOLUTE rules, which would map ## to H2.
    expect(headingTagFor('#')).toBe('H2')
    expect(headingTagFor('##')).toBe('H3')
    expect(headingTagFor('###')).toBe('H4')
    expect(headingTagFor('####')).toBe('H5')
    expect(headingTagFor('#####')).toBe('H6')
    expect(headingTagFor('######')).toBe('H6') // capped
    wrapper.unmount()
  })

  it('keeps an out-of-schema heading (legacy H1) lossless and shows it as the base level in the dropdown', async () => {
    const wrapper = await mountEditor({ modelValue: '# Legacy H1\n\n## Echte H2', baseHeadingLevel: 2 })
    const editor = getEditor(wrapper)
    // Lossless round-trip: the editor neither drops nor rewrites the stored markdown
    // on load (the single `#` is preserved, not normalised to `##`).
    const md = editor.getMarkdown()
    expect(md.startsWith('# Legacy H1')).toBe(true)
    expect(md).toContain('## Echte H2')
    // Cursor into the legacy H1 (rendered at the base level): the dropdown clamps to
    // the base level (Kop 1 = H2) instead of silently showing "Gewone tekst".
    editor.commands.setTextSelection(3)
    await flushPromises()
    expect((wrapper.find('select.markdown-toolbar__heading').element as HTMLSelectElement).value).toBe('2')
    wrapper.unmount()
  })

  it('clamps an out-of-range baseHeadingLevel to a valid level (no <hundefined>)', async () => {
    const wrapper = await mountEditor({ modelValue: 'Titel', baseHeadingLevel: 7 })
    // base clamps to 6 → a single available level ("Kop 1" = H6).
    const select = wrapper.find('select.markdown-toolbar__heading')
    expect(select.findAll('option').map((o) => o.text())).toEqual(['Gewone tekst', 'Kop 1'])
    await select.setValue('6')
    await flushPromises()
    const html = wrapper.find('.ProseMirror').html()
    expect(html).toContain('<h6')
    expect(html).not.toContain('hundefined')
    wrapper.unmount()
  })

  it('re-syncs on an external value change and ignores an echo of its own output', async () => {
    const wrapper = await mountEditor({ modelValue: 'Hallo' })
    await wrapper.find('select.markdown-toolbar__heading').setValue('2')
    await flushPromises()
    const ownMarkdown = wrapper.emitted('update:modelValue')!.at(-1)![0] as string

    await wrapper.setProps({ modelValue: ownMarkdown }) // echo → no re-set
    await flushPromises()
    await wrapper.setProps({ modelValue: '## Extern gewijzigd' }) // different → setContent
    await flushPromises()
    expect(wrapper.find('.ProseMirror').text()).toContain('Extern gewijzigd')
    wrapper.unmount()
  })
})

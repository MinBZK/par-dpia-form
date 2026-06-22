import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Editor } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
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
    const labels = ['Vet', 'Cursief', 'Onderstrepen', 'Doorhalen', 'Opsommingslijst', 'Genummerde lijst', 'Citaat', 'Code', 'Scheidingslijn']
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

  it('edits an existing link: pre-fills the url, opens it in the foreground, and removes it', async () => {
    const tab = { opener: {} as unknown, location: { replace: vi.fn() }, focus: vi.fn() }
    const openSpy = vi.fn(() => tab)
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

    // Openen → foreground tab: a blank tab whose opener is severed before navigating.
    await linkButton(wrapper, 'Openen').trigger('click')
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.opener).toBeNull()
    expect(tab.location.replace).toHaveBeenCalledWith('https://x.org')
    expect(tab.focus).toHaveBeenCalled()

    // A mailto link opens via window.open with noopener.
    await wrapper.find('.markdown-editor__linkinput').setValue('mailto:a@b.nl')
    await linkButton(wrapper, 'Openen').trigger('click')
    expect(openSpy).toHaveBeenCalledWith('mailto:a@b.nl', '_blank', 'noopener,noreferrer')

    // A non-openable url (empty) is a no-op.
    openSpy.mockClear()
    await wrapper.find('.markdown-editor__linkinput').setValue('')
    await linkButton(wrapper, 'Openen').trigger('click')
    expect(openSpy).not.toHaveBeenCalled()

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

  it('opens the link editor on Cmd/Ctrl+K and ignores other modifier keys', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const editor = getEditor(wrapper)
    const press = (key: string, mods: Record<string, boolean> = {}) =>
      editor.view.someProp('handleKeyDown', (h: (...a: unknown[]) => boolean) =>
        h(editor.view, new KeyboardEvent('keydown', { key, cancelable: true, ...mods })))
    press('k', { metaKey: true })
    await flushPromises()
    expect(wrapper.find('.markdown-editor__linkbar').exists()).toBe(true)
    // The handler runs for another Cmd shortcut but declines it.
    press('q', { ctrlKey: true })
    wrapper.unmount()
  })

  it('links the selected text when a URL is pasted, and otherwise pastes normally', async () => {
    const wrapper = await mountEditor({ modelValue: 'Mijn site' })
    const editor = getEditor(wrapper)
    // someProp also runs other extensions' paste handlers (Link reads the slice,
    // CodeBlock JSON-parses a clipboard key); pass an empty slice and only return
    // text for text/plain so those handlers no-op instead of throwing.
    const paste = (text: string) =>
      editor.view.someProp('handlePaste', (h: (...a: unknown[]) => boolean) =>
        h(editor.view, { clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') } }, Slice.empty))

    editor.commands.selectAll()
    paste('https://example.org') // URL over a selection → link the text
    await flushPromises()
    expect(wrapper.find('.ProseMirror').html()).toContain('href="https://example.org"')

    expect(paste('gewone tekst')).toBeFalsy() // non-URL → default paste
    expect(paste('')).toBeFalsy() // empty clipboard → default paste
    editor.commands.setTextSelection(1) // collapse the selection
    expect(paste('https://x.org')).toBeFalsy() // URL but nothing selected → default paste
    wrapper.unmount()
  })

  it('opens a focused tab on Cmd/Ctrl+click via the editor handleClick', async () => {
    const wrapper = await mountEditor({ modelValue: 'tekst' })
    const editor = getEditor(wrapper)
    const tab = { opener: {} as unknown, location: { replace: vi.fn() }, focus: vi.fn() }
    const openSpy = vi.fn(() => tab)
    vi.stubGlobal('open', openSpy)
    const anchor = document.createElement('a')
    anchor.href = 'https://x.org'
    const event = new MouseEvent('click', { cancelable: true, metaKey: true })
    Object.defineProperty(event, 'target', { value: anchor })
    editor.view.someProp('handleClick', (handler: (...args: unknown[]) => boolean) => handler(editor.view, 1, event))
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank')
    expect(tab.location.replace).toHaveBeenCalledWith('https://x.org/')
    expect(tab.focus).toHaveBeenCalled()
    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  // Drive the block-style dropdown: open it and pick an option by its visible label.
  async function pickBlock(wrapper: ReturnType<typeof mount>, label: string) {
    await wrapper.find('.markdown-toolbar__block-button').trigger('click')
    // The menu renders reactively (and the dropdown focuses an item on a nextTick);
    // settle those before querying so the lookup is deterministic under load.
    let item
    for (let i = 0; i < 10 && !item; i++) {
      await flushPromises()
      item = wrapper.findAll('.markdown-toolbar__menuitem').find((m) => m.text().includes(label))
    }
    await item!.trigger('click')
    await flushPromises()
  }

  it('applies and clears heading levels via the toolbar dropdown, and reflects the active block', async () => {
    const wrapper = await mountEditor({ modelValue: 'Titel' })
    const blockLabel = () => wrapper.find('.markdown-toolbar__block-button').text()
    expect(blockLabel()).toContain('Paragraaf') // starts as a paragraph

    await pickBlock(wrapper, 'Kop 1')
    expect(wrapper.find('.ProseMirror').html()).toContain('<h1')
    expect(blockLabel()).toContain('Kop 1') // dropdown follows the cursor block

    await pickBlock(wrapper, 'Kop 3')
    expect(wrapper.find('.ProseMirror').html()).toContain('<h3')

    await pickBlock(wrapper, 'Paragraaf')
    const html = wrapper.find('.ProseMirror').html()
    expect(html).not.toContain('<h1')
    expect(html).not.toContain('<h3')
    expect(blockLabel()).toContain('Paragraaf')
    wrapper.unmount()
  })

  it('maps a #-shortcut to the matching heading level (one hash = H1 .. six = H6)', async () => {
    const wrapper = await mountEditor({ modelValue: '' })
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
    expect(headingTagFor('#')).toBe('H1')
    expect(headingTagFor('##')).toBe('H2')
    expect(headingTagFor('######')).toBe('H6')
    wrapper.unmount()
  })

  it('offers a single generic "Koptekst" when restricted to one heading level', async () => {
    const wrapper = await mountEditor({ modelValue: '', headingLevels: [3] })
    const editor = getEditor(wrapper)
    await wrapper.find('.markdown-toolbar__block-button').trigger('click')
    await flushPromises()
    const items = wrapper.findAll('.markdown-toolbar__menuitem')
    expect(items.map((i) => i.find('.markdown-toolbar__menuitem-label').text())).toEqual(['Paragraaf', 'Koptekst'])
    // Any number of hashes maps to the single level (H3).
    editor.commands.setContent('<p>######</p>')
    editor.commands.focus('end')
    const view = editor.view
    const pos = view.state.selection.from
    view.someProp('handleTextInput', (handle: (...a: unknown[]) => boolean) => handle(view, pos, pos, ' '))
    expect((view.dom.firstElementChild as HTMLElement).tagName).toBe('H3')
    wrapper.unmount()
  })

  it('loads markdown headings at their own level and reflects them in the dropdown', async () => {
    const wrapper = await mountEditor({ modelValue: '# Titel\n\n## Sub' })
    const editor = getEditor(wrapper)
    const html = wrapper.find('.ProseMirror').html()
    expect(html).toContain('<h1')
    expect(html).toContain('<h2')
    expect(editor.getMarkdown()).toContain('# Titel') // lossless round-trip
    editor.commands.setTextSelection(3) // inside the H1
    await flushPromises()
    expect(wrapper.find('.markdown-toolbar__block-button').text()).toContain('Kop 1')
    wrapper.unmount()
  })

  it('lights up an active mark on the toolbar', async () => {
    const wrapper = await mountEditor({ modelValue: 'Tekst' })
    getEditor(wrapper).commands.selectAll()
    await wrapper.find('button[aria-label="Vet"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('button[aria-label="Vet"]').classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('toggles a code block and reflects it as active', async () => {
    const wrapper = await mountEditor({ modelValue: 'Tekst' })
    const editor = getEditor(wrapper)
    editor.commands.setTextSelection(2)
    await wrapper.find('button[aria-label="Codeblok"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.ProseMirror').html()).toContain('<pre')
    expect(editor.isActive('codeBlock')).toBe(true)
    editor.commands.setTextSelection(2) // re-sync the toolbar to the cursor inside the block
    await flushPromises()
    expect(wrapper.find('button[aria-label="Codeblok"]').classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('re-syncs on an external value change and ignores an echo of its own output', async () => {
    const wrapper = await mountEditor({ modelValue: 'Hallo' })
    await pickBlock(wrapper, 'Kop 2')
    const ownMarkdown = wrapper.emitted('update:modelValue')!.at(-1)![0] as string

    await wrapper.setProps({ modelValue: ownMarkdown }) // echo → no re-set
    await flushPromises()
    await wrapper.setProps({ modelValue: '## Extern gewijzigd' }) // different → setContent
    await flushPromises()
    expect(wrapper.find('.ProseMirror').text()).toContain('Extern gewijzigd')
    wrapper.unmount()
  })
})

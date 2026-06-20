import { describe, it, expect, beforeAll, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MARKDOWN_LINK_PATTERN, applyMarkdownLink, markdownLinkInputRule, openLinkOnModifierClick } from '../../src/utils/markdownLinkRule'

function clickEvent(target: EventTarget | null, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}): MouseEvent {
  const event = new MouseEvent('click', mods)
  Object.defineProperty(event, 'target', { value: target })
  return event
}

// jsdom has no layout engine; ProseMirror may measure the DOM on dispatch.
beforeAll(() => {
  const proto = Range.prototype as unknown as Record<string, unknown>
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })
  }
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) })
  }
})

function makeEditor() {
  return new Editor({ element: document.createElement('div'), extensions: [StarterKit] })
}

const RAW = '[een link](https://nu.nl)'

describe('markdownLinkRule', () => {
  it('matches a completed [text](url) and not incomplete or plain text', () => {
    const match = RAW.match(MARKDOWN_LINK_PATTERN)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('een link')
    expect(match![2]).toBe('https://nu.nl')
    expect('[geen link]'.match(MARKDOWN_LINK_PATTERN)).toBeNull()
    expect('gewone tekst'.match(MARKDOWN_LINK_PATTERN)).toBeNull()
  })

  it('applyMarkdownLink replaces the match with the text linked to the url', () => {
    const editor = makeEditor()
    editor.commands.setContent(`<p>${RAW}</p>`)
    const tr = editor.state.tr
    applyMarkdownLink(tr, editor.state.schema.marks.link, 1, 1 + RAW.length, 'een link', 'https://nu.nl')
    editor.view.dispatch(tr)
    const html = editor.getHTML()
    editor.destroy()
    expect(html).toContain('href="https://nu.nl"')
    expect(html).toContain('>een link</a>')
  })

  it('markdownLinkInputRule builds a rule whose handler links the matched text', () => {
    const editor = makeEditor()
    editor.commands.setContent(`<p>${RAW}</p>`)
    const rule = markdownLinkInputRule(editor.state.schema.marks.link)
    expect(rule.find).toBe(MARKDOWN_LINK_PATTERN)

    const match = RAW.match(MARKDOWN_LINK_PATTERN)!
    const tr = editor.state.tr
    rule.handler({ state: { tr, schema: editor.state.schema }, range: { from: 1, to: 1 + RAW.length }, match } as never)
    editor.view.dispatch(tr)
    const html = editor.getHTML()
    editor.destroy()
    expect(html).toContain('href="https://nu.nl"')
    expect(html).toContain('>een link</a>')
  })
})

describe('openLinkOnModifierClick', () => {
  it('opens the clicked link in a new tab when Cmd or Ctrl is held', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const anchor = document.createElement('a')
    anchor.href = 'https://x.org'

    expect(openLinkOnModifierClick(clickEvent(anchor, { metaKey: true }))).toBe(true)
    expect(openSpy).toHaveBeenCalledWith('https://x.org/', '_blank', 'noopener,noreferrer')
    expect(openLinkOnModifierClick(clickEvent(anchor, { ctrlKey: true }))).toBe(true)

    vi.unstubAllGlobals()
  })

  it('does nothing on a plain click, a non-link target, or no target', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const anchor = document.createElement('a')
    anchor.href = 'https://x.org'

    expect(openLinkOnModifierClick(clickEvent(anchor))).toBe(false) // no modifier
    expect(openLinkOnModifierClick(clickEvent(document.createElement('span'), { metaKey: true }))).toBe(false) // not a link
    expect(openLinkOnModifierClick(clickEvent(null, { metaKey: true }))).toBe(false) // no target
    expect(openSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

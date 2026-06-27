import { describe, it, expect, beforeAll, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MARKDOWN_LINK_PATTERN, applyMarkdownLink, markdownLinkInputRule, normalizeLinkHref, openLinkOnClick, openLinkUrl, openUrlInNewTab } from '../../src/utils/markdownLinkRule'

// openUrlInNewTab clicks a freshly created anchor; capture those clicks' attributes.
function spyAnchorClick() {
  const clicks: { href: string; target: string; rel: string }[] = []
  const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, target: this.target, rel: this.rel })
  })
  return { clicks, spy }
}

function clickEvent(target: EventTarget | null, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}): MouseEvent {
  const event = new MouseEvent('click', { cancelable: true, ...mods })
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

  it('the input rule normalises a schemeless url in [text](url) to https', () => {
    const editor = makeEditor()
    const raw = '[site](google.com)'
    editor.commands.setContent(`<p>${raw}</p>`)
    const rule = markdownLinkInputRule(editor.state.schema.marks.link)
    const match = raw.match(MARKDOWN_LINK_PATTERN)!
    const tr = editor.state.tr
    rule.handler({ state: { tr, schema: editor.state.schema }, range: { from: 1, to: 1 + raw.length }, match } as never)
    editor.view.dispatch(tr)
    const html = editor.getHTML()
    editor.destroy()
    expect(html).toContain('href="https://google.com"')
  })
})

describe('normalizeLinkHref', () => {
  it('keeps a scheme, mailto-ifies a bare email, https-defaults the rest', () => {
    expect(normalizeLinkHref('')).toBe('')
    expect(normalizeLinkHref('   ')).toBe('')
    expect(normalizeLinkHref('https://x.nl')).toBe('https://x.nl')
    expect(normalizeLinkHref('mailto:a@b.nl')).toBe('mailto:a@b.nl')
    // An existing (even disallowed) scheme is kept; the renderer's allowlist strips it.
    expect(normalizeLinkHref('javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(normalizeLinkHref('info@example.nl')).toBe('mailto:info@example.nl')
    expect(normalizeLinkHref('google.com')).toBe('https://google.com')
    expect(normalizeLinkHref(' www.x.nl/path ')).toBe('https://www.x.nl/path')
  })
})

describe('openLinkUrl', () => {
  it('opens http(s) in a foreground tab', () => {
    const { clicks, spy } = spyAnchorClick()
    expect(openLinkUrl('https://x.org/')).toBe(true)
    expect(clicks.at(-1)).toEqual({ href: 'https://x.org/', target: '_blank', rel: 'noopener noreferrer' })
    spy.mockRestore()
  })

  it('opens mailto via window.open and ignores other schemes', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    expect(openLinkUrl('mailto:a@b.nl')).toBe(true)
    expect(openSpy).toHaveBeenCalledWith('mailto:a@b.nl', '_blank', 'noopener,noreferrer')
    expect(openLinkUrl('')).toBe(false)
    expect(openLinkUrl('ftp://x')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('openUrlInNewTab / openLinkOnClick', () => {
  it('openUrlInNewTab clicks a synthetic noopener _blank anchor (foreground tab)', () => {
    const { clicks, spy } = spyAnchorClick()
    openUrlInNewTab('https://x.org/')
    expect(clicks).toEqual([{ href: 'https://x.org/', target: '_blank', rel: 'noopener noreferrer' }])
    spy.mockRestore()
  })

  it('opens the link and prevents the default on a (plain or modifier) click of an http(s) link', () => {
    const { clicks, spy } = spyAnchorClick()
    const anchor = document.createElement('a')
    anchor.href = 'https://x.org'

    const event = clickEvent(anchor) // plain click → opens (foreground)
    expect(openLinkOnClick(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(clicks.at(-1)).toEqual({ href: 'https://x.org/', target: '_blank', rel: 'noopener noreferrer' })

    expect(openLinkOnClick(clickEvent(anchor, { metaKey: true }))).toBe(true) // modifier click also opens
    spy.mockRestore()
  })

  it('opens a mailto link via window.open on click', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)
    const anchor = document.createElement('a')
    anchor.href = 'mailto:a@b.nl'
    const event = clickEvent(anchor)
    expect(openLinkOnClick(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(openSpy).toHaveBeenCalledWith('mailto:a@b.nl', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })

  it('does nothing on a non-link target, no target, or a non-http scheme', () => {
    const { clicks, spy } = spyAnchorClick()
    const jsAnchor = document.createElement('a')
    jsAnchor.setAttribute('href', 'javascript:alert(1)') // scheme blocked by the allowlist

    expect(openLinkOnClick(clickEvent(document.createElement('span')))).toBe(false) // not a link
    expect(openLinkOnClick(clickEvent(null))).toBe(false) // no target
    expect(openLinkOnClick(clickEvent(jsAnchor))).toBe(false) // disallowed scheme
    expect(clicks).toEqual([])
    spy.mockRestore()
  })
})

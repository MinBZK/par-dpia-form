import { describe, it, expect } from 'vitest'
import { renderMarkdownToHtml, markdownToPdfContent } from '../../src/utils/markdown'

// Helper: normalize the `text` field of a pdfmake content node into an array.
function textArray(content: any): any[] {
  return Array.isArray(content.text) ? content.text : [content.text]
}

describe('renderMarkdownToHtml', () => {
  it('returns empty string for empty input (falsy branch)', () => {
    expect(renderMarkdownToHtml('')).toBe('')
  })

  it('renders plain text (truthy branch)', () => {
    expect(renderMarkdownToHtml('Hello world')).toContain('<p>Hello world</p>')
  })

  it('strips raw HTML via the html() renderer', () => {
    const html = renderMarkdownToHtml('<script>alert("xss")</script>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert')
  })

  it('strips images via the image() renderer (markdown image)', () => {
    const html = renderMarkdownToHtml('![alt](https://example.com/img.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('src')
  })

  it('renders https links with target/rel (allowlisted protocol branch)', () => {
    const html = renderMarkdownToHtml('[click me](https://example.com)')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('click me')
  })

  it('allows mailto links (allowlisted protocol branch)', () => {
    const html = renderMarkdownToHtml('[mail](mailto:test@example.com)')
    expect(html).toContain('href="mailto:test@example.com"')
  })

  it('strips disallowed protocol links keeping only text (rejected branch)', () => {
    const html = renderMarkdownToHtml('[click](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('renders unchecked task list checkbox as ☐ (false branch)', () => {
    const html = renderMarkdownToHtml('- [ ] todo')
    expect(html).not.toContain('<input')
    expect(html).toContain('&#x2610;')
    expect(html).toContain('task-list-item')
  })

  it('renders checked task list checkbox as ☑ (true branch)', () => {
    const html = renderMarkdownToHtml('- [x] done')
    expect(html).toContain('&#x2611;')
    expect(html).toContain('task-list-item')
  })

  it('renders a regular (non-task) list item without task class', () => {
    const html = renderMarkdownToHtml('- plain item')
    expect(html).toContain('<li>plain item</li>')
    expect(html).not.toContain('task-list-item')
  })
})

describe('markdownToPdfContent — empty and aggregation branches', () => {
  it('returns empty text for empty input (falsy branch)', () => {
    expect(markdownToPdfContent('')).toEqual({ text: '' })
  })

  it('returns empty text when parsing yields no block content', () => {
    // Whitespace-only input lexes to only `space` tokens, which produce no
    // content -> content.length === 0 branch.
    expect(markdownToPdfContent('   \n\n   ')).toEqual({ text: '' })
  })

  it('returns the single node directly for one block (length === 1 branch)', () => {
    const content = markdownToPdfContent('Hello') as any
    expect(content.stack).toBeUndefined()
    expect(textArray(content)).toContain('Hello')
  })

  it('wraps multiple blocks in a stack (length > 1 branch)', () => {
    const content = markdownToPdfContent('Paragraph 1\n\nParagraph 2') as any
    expect(content.stack).toBeDefined()
    expect(content.stack).toHaveLength(2)
  })
})

describe('markdownToPdfContent — inline token handling (processInlineTokens)', () => {
  it('handles strong (bold)', () => {
    const content = markdownToPdfContent('**bold**') as any
    const bold = textArray(content).find((t: any) => typeof t === 'object' && t.bold)
    expect(bold).toBeDefined()
  })

  it('handles em (italics)', () => {
    const content = markdownToPdfContent('*italic*') as any
    const italic = textArray(content).find((t: any) => typeof t === 'object' && t.italics)
    expect(italic).toBeDefined()
  })

  it('handles del (strikethrough) as plain styled text', () => {
    const content = markdownToPdfContent('~~struck~~') as any
    // del renders to { text: [...] } with neither bold nor italics.
    const delItem = textArray(content).find(
      (t: any) => typeof t === 'object' && !t.bold && !t.italics && !t.background && Array.isArray(t.text),
    )
    expect(delItem).toBeDefined()
  })

  it('handles codespan with background colour', () => {
    const content = markdownToPdfContent('`code`') as any
    const span = textArray(content).find((t: any) => typeof t === 'object' && t.background === '#e8e8e8')
    expect(span).toBeDefined()
    expect(span.text).toBe('code')
  })

  it('handles http link as clickable styled text (allowlisted branch)', () => {
    const content = markdownToPdfContent('[**bold** plain\nmore](https://example.com)') as any
    const link = textArray(content).find((t: any) => typeof t === 'object' && t.link === 'https://example.com')
    expect(link).toBeDefined()
    expect(link.color).toBe('#154273')
    expect(link.decoration).toBe('underline')
    // flattenToString must have walked nested strong (tokens branch),
    // plain text (text branch) and a br (empty fallthrough branch).
    expect(link.text).toContain('bold')
    expect(link.text).toContain('plain')
    expect(link.text).toContain('more')
  })

  it('handles mailto link as clickable styled text', () => {
    const content = markdownToPdfContent('[mail](mailto:test@example.com)') as any
    const link = textArray(content).find((t: any) => typeof t === 'object' && t.link === 'mailto:test@example.com')
    expect(link).toBeDefined()
    expect(link.text).toBe('mail')
  })

  it('handles disallowed link by inlining its child tokens (rejected branch)', () => {
    const content = markdownToPdfContent('[plain link text](javascript:alert(1))') as any
    const parts = textArray(content)
    // No clickable link object should be produced.
    expect(parts.find((t: any) => typeof t === 'object' && t.link)).toBeUndefined()
    // The link text is inlined as plain string(s).
    expect(parts.some((t: any) => typeof t === 'string' && t.includes('plain link text'))).toBe(true)
  })

  it('handles br as a newline', () => {
    const content = markdownToPdfContent('line one\nline two') as any
    expect(textArray(content)).toContain('\n')
  })

  it('handles text token that has nested tokens (text-with-tokens branch)', () => {
    // A tight list item produces a `text` token whose `tokens` array holds the
    // inline children -> the `if (t.tokens)` true branch in the text case.
    const content = markdownToPdfContent('- alpha *beta* gamma') as any
    expect(content.ul).toBeDefined()
    const itemText = content.ul[0].text
    expect(Array.isArray(itemText)).toBe(true)
    // The italic child survived the nested processing.
    expect(itemText.some((t: any) => typeof t === 'object' && t.italics)).toBe(true)
  })

  it('handles plain text token without nested tokens (text-without-tokens branch)', () => {
    // A simple link text yields a bare `text` token (no nested tokens). Using a
    // disallowed protocol forces processInlineTokens over those child tokens.
    const content = markdownToPdfContent('[just text](javascript:void(0))') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('just text'))).toBe(true)
  })

  it('handles escaped characters (escape branch)', () => {
    const content = markdownToPdfContent('a \\* b') as any
    // The escape token produces the literal '*' character somewhere in the parts.
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('*'))).toBe(true)
  })

  it('handles an unknown inline token with text via the default branch (inline image)', () => {
    // Inline images are not handled by the switch; the `image` token carries a
    // `text` field (the alt text) -> default branch, `'text' in t` true.
    const content = markdownToPdfContent('see ![the alt](https://example.com/x.png) here') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('the alt'))).toBe(true)
  })
})

describe('markdownToPdfContent — block token handling (processBlockTokens)', () => {
  it('handles a paragraph block', () => {
    const content = markdownToPdfContent('a paragraph') as any
    expect(content.margin).toEqual([0, 0, 0, 5])
    expect(textArray(content)).toContain('a paragraph')
  })

  it('handles a heading block with computed font size', () => {
    const content = markdownToPdfContent('# Title') as any
    expect(content.bold).toBe(true)
    expect(content.fontSize).toBe(16) // depth 1 -> 16
    expect(content.margin).toEqual([0, 5, 0, 3])
  })

  it('clamps heading font size to a minimum of 10 for deep headings', () => {
    // depth 6 -> 16 - 5*2 = 6 -> Math.max(10, 6) = 10
    const content = markdownToPdfContent('###### Deep') as any
    expect(content.fontSize).toBe(10)
  })

  it('handles an ordered list (ordered branch)', () => {
    const content = markdownToPdfContent('1. first\n2. second') as any
    expect(content.ol).toBeDefined()
    expect(content.ol).toHaveLength(2)
    expect(content.ul).toBeUndefined()
  })

  it('handles an unordered list (unordered branch)', () => {
    const content = markdownToPdfContent('- one\n- two') as any
    expect(content.ul).toBeDefined()
    expect(content.ul).toHaveLength(2)
    expect(content.ol).toBeUndefined()
  })

  it('handles a fenced code block', () => {
    const content = markdownToPdfContent('```\nconst x = 1\n```') as any
    expect(content.layout).toBe('noBorders')
    expect(content.table.body[0][0].text).toContain('const x = 1')
    expect(content.table.body[0][0].fillColor).toBe('#e8e8e8')
  })

  it('handles a blockquote (recurses into processBlockTokens)', () => {
    const content = markdownToPdfContent('> quoted text') as any
    expect(content.layout).toBe('noBorders')
    const stack = content.table.body[0][0].stack
    expect(Array.isArray(stack)).toBe(true)
    // The inner paragraph from the quote was processed recursively.
    expect(stack.length).toBeGreaterThan(0)
  })

  it('handles a horizontal rule', () => {
    const content = markdownToPdfContent('text\n\n---\n\nmore') as any
    const hr = content.stack.find((c: any) => Array.isArray(c.canvas))
    expect(hr).toBeDefined()
    expect(hr.canvas[0].type).toBe('line')
  })

  it('ignores space tokens (space branch produces no content)', () => {
    // Two paragraphs separated by a blank line: the blank line lexes to a
    // `space` token that must NOT add a content node, so we get exactly 2.
    const content = markdownToPdfContent('para one\n\npara two') as any
    expect(content.stack).toHaveLength(2)
  })

  it('handles an unknown block token with a string text (default true branch)', () => {
    // A raw HTML block lexes to an `html` token, which is not in the switch but
    // carries a string `text` -> default branch, `'text' in t && typeof text === string`.
    const content = markdownToPdfContent('<div>raw block</div>') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('raw block'))).toBe(true)
  })

  it('handles an unknown block token without a string text (default false branch)', () => {
    // A GFM table lexes to a `table` token, not handled by the switch and with
    // no top-level `text` property -> default branch where nothing is pushed.
    // The table is the only block, so an empty content array results.
    const content = markdownToPdfContent('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(content).toEqual({ text: '' })
  })
})

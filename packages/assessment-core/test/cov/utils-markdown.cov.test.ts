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

  it('renders ++text++ as <u> underline, and leaves an unterminated ++ literal', () => {
    expect(renderMarkdownToHtml('++onder++ streep')).toContain('<u>onder</u>')
    // Nested inline marks inside the underline are still parsed.
    expect(renderMarkdownToHtml('++**vet**++')).toContain('<u><strong>vet</strong></u>')
    // No closing ++ -> the tokenizer returns undefined and the text stays literal.
    expect(renderMarkdownToHtml('++incompleet')).toContain('++incompleet')
  })

  it('renders ==text== as <mark> highlight, and leaves an unterminated == literal', () => {
    expect(renderMarkdownToHtml('een ==gemarkeerd== woord')).toContain('<mark>gemarkeerd</mark>')
    // Nested inline marks inside the highlight are still parsed.
    expect(renderMarkdownToHtml('==**vet**==')).toContain('<mark><strong>vet</strong></mark>')
    // No closing == -> the tokenizer returns undefined and the text stays literal.
    expect(renderMarkdownToHtml('==incompleet')).toContain('==incompleet')
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

  it('renders del (strikethrough) with a lineThrough decoration', () => {
    const content = markdownToPdfContent('~~struck~~') as any
    const delItem = textArray(content).find(
      (t: any) => typeof t === 'object' && t.decoration === 'lineThrough',
    )
    expect(delItem).toBeDefined()
  })

  it('renders ++underline++ with an underline decoration', () => {
    const content = markdownToPdfContent('++onder++') as any
    const item = textArray(content).find(
      (t: any) => typeof t === 'object' && t.decoration === 'underline',
    )
    expect(item).toBeDefined()
  })

  it('renders ==highlight== with a background colour', () => {
    const content = markdownToPdfContent('==gemarkeerd==') as any
    const item = textArray(content).find(
      (t: any) => typeof t === 'object' && t.background === '#fff3a0',
    )
    expect(item).toBeDefined()
    expect(item.text).toBe('gemarkeerd')
  })

  it('collapses a nested mark onto one string-text leaf (bold + underline)', () => {
    // pdfmake drops styling on array-text wrappers, so nested marks must end up
    // on a single string-text leaf carrying every style for it to render.
    const content = markdownToPdfContent('**++both++**') as any
    const leaf = textArray(content).find((t: any) => typeof t === 'object' && t.text === 'both')
    expect(leaf).toBeDefined()
    expect(leaf.bold).toBe(true)
    expect(leaf.decoration).toBe('underline')
  })

  it('combines stacked decorations into an array (strikethrough + underline)', () => {
    const content = markdownToPdfContent('++~~both~~++') as any
    const leaf = textArray(content).find((t: any) => typeof t === 'object' && t.text === 'both')
    expect(leaf).toBeDefined()
    expect(leaf.decoration).toEqual(['lineThrough', 'underline'])
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
    expect(parts.find((t: any) => typeof t === 'object' && t.link)).toBeUndefined()
    expect(parts.some((t: any) => typeof t === 'string' && t.includes('plain link text'))).toBe(true)
  })

  it('handles br as a newline', () => {
    const content = markdownToPdfContent('line one\nline two') as any
    expect(textArray(content)).toContain('\n')
  })

  it('handles text token that has nested tokens (text-with-tokens branch)', () => {
    const content = markdownToPdfContent('- alpha *beta* gamma') as any
    expect(content.ul).toBeDefined()
    const itemText = content.ul[0].text
    expect(Array.isArray(itemText)).toBe(true)
    expect(itemText.some((t: any) => typeof t === 'object' && t.italics)).toBe(true)
  })

  it('handles plain text token without nested tokens (text-without-tokens branch)', () => {
    const content = markdownToPdfContent('[just text](javascript:void(0))') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('just text'))).toBe(true)
  })

  it('handles escaped characters (escape branch)', () => {
    const content = markdownToPdfContent('a \\* b') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('*'))).toBe(true)
  })

  it('handles an unknown inline token with text via the default branch (inline image)', () => {
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
    expect(content.fontSize).toBe(16)
    expect(content.margin).toEqual([0, 5, 0, 3])
  })

  it('gives each heading level a distinct, shrinking font size', () => {
    const sizeOf = (md: string) => (markdownToPdfContent(md) as any).fontSize
    // H2..H4 each step down by 1.5pt; the sequence stays strictly decreasing.
    expect(sizeOf('## Two')).toBe(14.5)
    expect(sizeOf('### Three')).toBe(13)
    expect(sizeOf('#### Four')).toBe(11.5)
    expect(sizeOf('##### Five')).toBe(10)
  })

  it('clamps heading font size to a minimum of 9 for the deepest heading', () => {
    const content = markdownToPdfContent('###### Deep') as any
    expect(content.fontSize).toBe(9)
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
    expect(stack.length).toBeGreaterThan(0)
  })

  it('handles a horizontal rule as a width-adaptive bottom-border table', () => {
    const content = markdownToPdfContent('text\n\n---\n\nmore') as any
    const hr = content.stack.find((c: any) => c.table)
    expect(hr).toBeDefined()
    expect(hr.table.widths).toEqual(['*'])
    expect(hr.table.body[0][0].border).toEqual([false, false, false, true])
    expect(hr.canvas).toBeUndefined()
  })

  it('ignores space tokens (space branch produces no content)', () => {
    const content = markdownToPdfContent('para one\n\npara two') as any
    expect(content.stack).toHaveLength(2)
  })

  it('handles an unknown block token with a string text (default true branch)', () => {
    const content = markdownToPdfContent('<div>raw block</div>') as any
    expect(textArray(content).some((t: any) => typeof t === 'string' && t.includes('raw block'))).toBe(true)
  })

  it('handles an unknown block token without a string text (default false branch)', () => {
    const content = markdownToPdfContent('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(content).toEqual({ text: '' })
  })
})

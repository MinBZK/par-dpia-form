import { describe, it, expect } from 'vitest'
import { renderMarkdownToHtml, markdownToPdfContent } from '../src/utils/markdown'

describe('renderMarkdownToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdownToHtml('')).toBe('')
  })

  it('renders plain text as a paragraph', () => {
    const html = renderMarkdownToHtml('Hello world')
    expect(html).toContain('<p>Hello world</p>')
  })

  it('renders bold text', () => {
    const html = renderMarkdownToHtml('**bold**')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders italic text', () => {
    const html = renderMarkdownToHtml('*italic*')
    expect(html).toContain('<em>italic</em>')
  })

  it('renders unordered lists', () => {
    const html = renderMarkdownToHtml('- item 1\n- item 2')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>item 1</li>')
    expect(html).toContain('<li>item 2</li>')
  })

  it('renders ordered lists', () => {
    const html = renderMarkdownToHtml('1. first\n2. second')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('<li>second</li>')
  })

  it('renders headings', () => {
    const html = renderMarkdownToHtml('## Heading')
    expect(html).toContain('<h2>Heading</h2>')
  })

  it('strips raw HTML tags', () => {
    const html = renderMarkdownToHtml('<script>alert("xss")</script>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert')
  })

  it('strips img tags with event handlers', () => {
    const html = renderMarkdownToHtml('<img onerror="alert(1)" src="x">')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
  })

  it('renders links with target="_blank"', () => {
    const html = renderMarkdownToHtml('[click me](https://example.com)')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('click me')
  })

  it('strips markdown images', () => {
    const html = renderMarkdownToHtml('![alt](https://example.com/img.png)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('src')
  })

  it('strips javascript: protocol links', () => {
    const html = renderMarkdownToHtml('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('strips data: protocol links', () => {
    const html = renderMarkdownToHtml('[click](data:text/html,<script>alert(1)</script>)')
    expect(html).not.toContain('data:')
    expect(html).toContain('click')
  })

  it('strips vbscript: protocol links', () => {
    const html = renderMarkdownToHtml('[click](vbscript:alert(1))')
    expect(html).not.toContain('vbscript:')
    expect(html).toContain('click')
  })

  it('allows mailto: links', () => {
    const html = renderMarkdownToHtml('[mail](mailto:test@example.com)')
    expect(html).toContain('href="mailto:test@example.com"')
  })

  it('converts single newlines to <br>', () => {
    const html = renderMarkdownToHtml('line one\nline two')
    expect(html).toContain('<br>')
    expect(html).toContain('line one')
    expect(html).toContain('line two')
  })

  it('renders task list checkboxes as unicode', () => {
    const html = renderMarkdownToHtml('- [ ] todo\n- [x] done')
    expect(html).not.toContain('<input')
    expect(html).toContain('&#x2610;')
    expect(html).toContain('&#x2611;')
  })

  it('escapes a double-quote breakout in the link href', () => {
    const html = renderMarkdownToHtml('[click](https://example.com#"><img src=x onerror=alert(1)>)')
    expect(html).not.toContain('"><')
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('&quot;')
  })

  it('escapes quotes/spaces in a pointy-bracket link destination', () => {
    // marked's <...> link syntax preserves literal quotes and spaces in the href
    const html = renderMarkdownToHtml('[click](<https://a" onmouseover="alert(1)>)')
    expect(html).not.toMatch(/href="https:\/\/a" onmouseover/)
    expect(html).not.toContain('onmouseover="alert(1)"')
    expect(html).toContain('click')
  })

  it('keeps legitimate ampersands in a link href as an entity', () => {
    const html = renderMarkdownToHtml('[ok](https://e.com/p?a=1&b=2)')
    expect(html).toContain('href="https://e.com/p?a=1&amp;b=2"')
  })
})

describe('markdownToPdfContent', () => {
  it('returns empty text for empty input', () => {
    expect(markdownToPdfContent('')).toEqual({ text: '' })
  })

  it('returns a paragraph for plain text', () => {
    const content = markdownToPdfContent('Hello') as any
    expect(content.text).toBeDefined()
    // The text array should contain 'Hello'
    const texts = Array.isArray(content.text) ? content.text : [content.text]
    expect(texts).toContain('Hello')
  })

  it('renders bold text with bold: true', () => {
    const content = markdownToPdfContent('**bold**') as any
    const texts = Array.isArray(content.text) ? content.text : [content.text]
    const boldItem = texts.find((t: any) => typeof t === 'object' && t.bold)
    expect(boldItem).toBeDefined()
  })

  it('renders italic text with italics: true', () => {
    const content = markdownToPdfContent('*italic*') as any
    const texts = Array.isArray(content.text) ? content.text : [content.text]
    const italicItem = texts.find((t: any) => typeof t === 'object' && t.italics)
    expect(italicItem).toBeDefined()
  })

  it('renders unordered list with ul property', () => {
    const content = markdownToPdfContent('- item 1\n- item 2') as any
    expect(content.ul).toBeDefined()
    expect(content.ul).toHaveLength(2)
  })

  it('renders ordered list with ol property', () => {
    const content = markdownToPdfContent('1. first\n2. second') as any
    expect(content.ol).toBeDefined()
    expect(content.ol).toHaveLength(2)
  })

  it('returns a stack for multiple block elements', () => {
    const content = markdownToPdfContent('Paragraph 1\n\nParagraph 2') as any
    expect(content.stack).toBeDefined()
    expect(content.stack).toHaveLength(2)
  })

  it('converts single newlines to line breaks', () => {
    const content = markdownToPdfContent('line one\nline two') as any
    const texts = Array.isArray(content.text) ? content.text : [content.text]
    expect(texts).toContain('\n')
  })

  it('handles mixed content', () => {
    const content = markdownToPdfContent('**bold** and *italic*') as any
    const texts = Array.isArray(content.text) ? content.text : [content.text]
    expect(texts.length).toBeGreaterThan(1)
  })
})

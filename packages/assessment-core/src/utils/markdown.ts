import { Marked, type Tokens, type Token, type MarkedToken, type TokenizerAndRendererExtension } from 'marked'
import type { Content } from 'pdfmake/interfaces'
import { escapeHtml } from './escapeHtml'

// `++text++` underline, matching what @tiptap/markdown serialises (marked has no
// built-in underline). A small inline extension renders it for both the HTML
// preview and the PDF lexer. The rendered output is a fixed <u> tag whose inner
// content goes through the safe inline renderers, so no raw HTML can leak in.
const underlineExtension: TokenizerAndRendererExtension = {
  name: 'underline',
  level: 'inline',
  start(src) { return src.indexOf('++') },
  tokenizer(src) {
    const match = /^\+\+([\s\S]+?)\+\+/.exec(src)
    if (!match) return undefined
    return { type: 'underline', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) }
  },
  renderer(token) {
    // The tokenizer always sets `tokens`, so it is present here.
    return `<u>${this.parser.parseInline(token.tokens!)}</u>`
  },
}

// Marked instance with a custom renderer that acts as an allowlist.
// Only safe HTML tags are produced; raw HTML input and images are stripped.
// Links are rendered with target="_blank" and rel="noopener noreferrer".
const safeMarked = new Marked({
  breaks: true,
  renderer: {
    html() { return '' },
    image() { return '' },
    link({ href, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens)
      if (!/^https?:\/\/|^mailto:/i.test(href)) return text
      // Escape href: marked keeps quotes/spaces in <...> destinations (attribute-breakout XSS).
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
    checkbox({ checked }: Tokens.Checkbox) {
      return checked ? '&#x2611; ' : '&#x2610; '
    },
    listitem(item: Tokens.ListItem) {
      const content = this.parser.parse(item.tokens)
      if (item.task) return `<li class="task-list-item">${content}</li>\n`
      return `<li>${content}</li>\n`
    },
    // All remaining methods use the default renderer (safe tags only)
  },
})
safeMarked.use({ extensions: [underlineExtension] })

/**
 * Parse markdown to sanitized HTML for preview rendering.
 * Uses an allowlist renderer: only safe tags (p, strong, em, u, ul, ol, li, h1-h6,
 * code, pre, blockquote, hr, br, del, a) are produced. Raw HTML and images
 * are stripped. Links open in a new tab.
 */
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''
  return safeMarked.parse(markdown, { async: false }) as string
}

// ---------------------------------------------------------------------------
// Markdown → pdfmake Content
// ---------------------------------------------------------------------------

type PdfText = string | { text: string | PdfText[]; bold?: boolean; italics?: boolean; link?: string; color?: string; decoration?: string; background?: string }

function flattenToString(tokens: Token[]): string {
  return tokens.map(token => {
    const t = token as MarkedToken
    if ('tokens' in t && t.tokens) return flattenToString(t.tokens)
    if ('text' in t) return (t as { text: string }).text
    return ''
  }).join('')
}

function processInlineTokens(tokens: Token[]): PdfText[] {
  const parts: PdfText[] = []
  for (const token of tokens) {
    const t = token as MarkedToken
    // `underline` is our custom inline token (not part of MarkedToken's union).
    if ((t as { type: string }).type === 'underline') {
      parts.push({ text: processInlineTokens((t as unknown as { tokens: Token[] }).tokens), decoration: 'underline' })
      continue
    }
    switch (t.type) {
      case 'strong':
        parts.push({ text: processInlineTokens(t.tokens), bold: true })
        break
      case 'em':
        parts.push({ text: processInlineTokens(t.tokens), italics: true })
        break
      case 'del':
        parts.push({ text: processInlineTokens(t.tokens), decoration: 'lineThrough' })
        break
      case 'codespan':
        parts.push({ text: t.text, background: '#e8e8e8' } as PdfText)
        break
      case 'link':
        // pdfmake requires link text to be a flat string for clickable links
        if (/^https?:\/\/|^mailto:/i.test(t.href)) {
          parts.push({ text: flattenToString(t.tokens), link: t.href, color: '#154273', decoration: 'underline' })
        } else {
          parts.push(...processInlineTokens(t.tokens))
        }
        break
      case 'br':
        parts.push('\n')
        break
      case 'text':
        if (t.tokens) {
          parts.push(...processInlineTokens(t.tokens))
        } else {
          parts.push(t.text)
        }
        break
      case 'escape':
        parts.push(t.text)
        break
      default:
        parts.push((t as { text: string }).text)
        break
    }
  }
  return parts
}

function processBlockTokens(tokens: Token[]): Content[] {
  const content: Content[] = []
  for (const token of tokens) {
    const t = token as MarkedToken
    switch (t.type) {
      case 'paragraph':
        content.push({ text: processInlineTokens(t.tokens) as any, margin: [0, 0, 0, 5] })
        break
      case 'heading': {
        // Distinct, monotonically shrinking sizes for every level so H2..H6 stay
        // visually distinguishable in the PDF (floored at 9pt for readability).
        const fontSize = Math.max(9, 16 - (t.depth - 1) * 1.5)
        content.push({ text: processInlineTokens(t.tokens) as any, bold: true, fontSize, margin: [0, 5, 0, 3] })
        break
      }
      case 'list':
        if (t.ordered) {
          content.push({
            ol: t.items.map(item => ({
              text: processInlineTokens(item.tokens) as any,
            })),
            margin: [0, 0, 0, 5],
          } as Content)
        } else {
          content.push({
            ul: t.items.map(item => ({
              text: processInlineTokens(item.tokens) as any,
            })),
            margin: [0, 0, 0, 5],
          } as Content)
        }
        break
      case 'code':
        content.push({
          margin: [0, 3, 0, 5],
          table: {
            widths: ['*'],
            body: [[{
              text: t.text,
              fillColor: '#e8e8e8',
              margin: [6, 4, 6, 4],
            }]],
          },
          layout: 'noBorders',
        } as Content)
        break
      case 'blockquote':
        content.push({
          margin: [0, 4, 0, 0],
          table: {
            widths: ['*'],
            body: [[{
              stack: processBlockTokens(t.tokens),
              fillColor: '#e8e8e8',
              color: '#333',
              margin: [6, 4, 6, 0],
            }]],
          },
          layout: 'noBorders',
        } as Content)
        break
      case 'hr':
        content.push({
          table: { widths: ['*'], body: [[{ text: '', border: [false, false, false, true] }]] },
          margin: [0, 5, 0, 5],
        } as Content)
        break
      case 'space':
        break
      default:
        // Unknown block token — extract text if available
        if ('text' in t && typeof t.text === 'string') {
          content.push({ text: t.text })
        }
        break
    }
  }
  return content
}

/**
 * Parse markdown into pdfmake Content objects.
 * Handles paragraphs, bold, italic, ordered/unordered lists, headings,
 * code blocks, blockquotes and horizontal rules.
 * Unsupported tokens fall back to plain text.
 */
export function markdownToPdfContent(markdown: string): Content {
  if (!markdown) return { text: '' }

  const pdfMarked = new Marked({ breaks: true })
  pdfMarked.use({ extensions: [underlineExtension] })
  const tokens = pdfMarked.lexer(markdown)
  const content = processBlockTokens(tokens)

  if (content.length === 0) return { text: '' }
  if (content.length === 1) return content[0]
  return { stack: content }
}

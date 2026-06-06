import { describe, it, expect } from 'vitest'
import { cleanDefinitions, getPlainTextWithoutDefinitions } from '../../src/utils/stripHtml'

describe('cleanDefinitions', () => {
  it('returns empty string for empty string input', () => {
    expect(cleanDefinitions('')).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(cleanDefinitions(undefined)).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(cleanDefinitions(null)).toBe('')
  })

  it('leaves plain html without definition spans untouched', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    expect(cleanDefinitions(html)).toBe(html)
  })

  it('removes aiv-definition-text spans entirely', () => {
    const html =
      '<p>Voor <span class="aiv-definition-text">uitleg over de term</span>tekst</p>'
    const result = cleanDefinitions(html)
    expect(result).not.toContain('aiv-definition-text')
    expect(result).not.toContain('uitleg over de term')
    expect(result).toContain('Voor ')
    expect(result).toContain('tekst')
  })

  it('replaces aiv-definition spans with their plain text content', () => {
    const html =
      '<p>De <span class="aiv-definition">verwerkingsverantwoordelijke</span> bepaalt.</p>'
    const result = cleanDefinitions(html)
    expect(result).not.toContain('aiv-definition')
    expect(result).not.toContain('<span')
    expect(result).toContain('verwerkingsverantwoordelijke')
    expect(result).toContain('De ')
    expect(result).toContain(' bepaalt.')
  })

  it('handles an aiv-definition span with empty content (textContent falsy branch)', () => {
    const html = '<p>before<span class="aiv-definition"></span>after</p>'
    const result = cleanDefinitions(html)
    expect(result).not.toContain('aiv-definition')
    expect(result).not.toContain('<span')
    expect(result).toContain('before')
    expect(result).toContain('after')
  })

  it('handles both definition and definition-text spans together', () => {
    const html =
      '<p>De <span class="aiv-definition">betrokkene<span class="aiv-definition-text">de persoon</span></span> heeft rechten.</p>'
    const result = cleanDefinitions(html)
    expect(result).not.toContain('aiv-definition')
    expect(result).not.toContain('de persoon')
    expect(result).toContain('betrokkene')
    expect(result).toContain('heeft rechten')
  })
})

describe('getPlainTextWithoutDefinitions', () => {
  it('returns empty string for empty string input', () => {
    expect(getPlainTextWithoutDefinitions('')).toBe('')
  })

  it('returns empty string for undefined input', () => {
    expect(getPlainTextWithoutDefinitions(undefined)).toBe('')
  })

  it('returns empty string for null input', () => {
    expect(getPlainTextWithoutDefinitions(null)).toBe('')
  })

  it('strips all html tags and returns plain text', () => {
    const html = '<p>Hello <strong>world</strong></p>'
    expect(getPlainTextWithoutDefinitions(html)).toBe('Hello world')
  })

  it('returns plain text without definition-text content', () => {
    const html =
      '<p>De <span class="aiv-definition">verwerker<span class="aiv-definition-text">de uitleg</span></span> handelt.</p>'
    const result = getPlainTextWithoutDefinitions(html)
    expect(result).not.toContain('de uitleg')
    expect(result).toContain('verwerker')
    expect(result).toContain('handelt')
  })

  it('returns empty string when the cleaned html has no text content (textContent falsy branch)', () => {
    const html = '<br><hr>'
    expect(getPlainTextWithoutDefinitions(html)).toBe('')
  })
})

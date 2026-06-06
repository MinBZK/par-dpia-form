import { describe, it, expect } from 'vitest'
import { escapeHtml, stripHtml } from '../../src/utils/html'

describe('escapeHtml', () => {
  it('escapes all four special characters', () => {
    expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;')
  })

  it('escapes ampersand first so it does not double-escape entities', () => {
    // The & in the input must become &amp; and the < must become &lt;.
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c')
  })

  it('escapes multiple occurrences globally', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;')
    expect(escapeHtml('""')).toBe('&quot;&quot;')
  })

  it('returns a string without special characters unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
  })

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('stripHtml', () => {
  it('returns the input unchanged when it contains no < character', () => {
    // Covers the early-return branch: !str.includes('<') === true
    expect(stripHtml('plain text')).toBe('plain text')
  })

  it('returns an empty string unchanged (no tags present)', () => {
    expect(stripHtml('')).toBe('')
  })

  it('strips a single HTML tag', () => {
    // Covers the branch where < is present: !str.includes('<') === false
    expect(stripHtml('<b>bold</b>')).toBe('bold')
  })

  it('strips multiple tags and keeps text content', () => {
    expect(stripHtml('<p>Hallo <strong>wereld</strong></p>')).toBe('Hallo wereld')
  })

  it('strips a self-closing/void tag', () => {
    expect(stripHtml('line<br/>break')).toBe('linebreak')
  })

  it('strips tags with attributes', () => {
    expect(stripHtml('<a href="https://example.com">link</a>')).toBe('link')
  })
})

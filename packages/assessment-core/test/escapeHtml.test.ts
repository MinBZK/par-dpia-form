import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../src/utils/escapeHtml'

describe('escapeHtml', () => {
  it('escapes &, <, >, " and \'', () => {
    expect(escapeHtml(`<tag attr="x" data='y'> & </tag>`)).toBe(
      '&lt;tag attr=&quot;x&quot; data=&#39;y&#39;&gt; &amp; &lt;/tag&gt;',
    )
  })

  it('escapes & first so existing entities are not double-decoded', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c')
  })

  it('neutralizes an attribute-breakout payload', () => {
    const out = escapeHtml('"><img src=x onerror=alert(1)>')
    expect(out).not.toContain('"><')
    expect(out).not.toMatch(/<img/i)
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Gewone tekst 123')).toBe('Gewone tekst 123')
  })
})

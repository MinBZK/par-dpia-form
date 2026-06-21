import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { buildStandaloneCsp, injectMeta } from '../build/cspHashPlugin'

const sha256 = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`

describe('buildStandaloneCsp', () => {
  it('hashes the inline script and style and puts them in the CSP', () => {
    const html = `<html><head><style>.a{color:red}</style></head><body><script type="module">console.log(1)</script></body></html>`
    const { metaCsp } = buildStandaloneCsp(html)
    expect(metaCsp).toContain(`script-src 'self' ${sha256('console.log(1)')}`)
    expect(metaCsp).toContain(`style-src 'self' ${sha256('.a{color:red}')}`)
  })

  it('includes the Trusted Types directives in the policy', () => {
    const { metaCsp } = buildStandaloneCsp(`<head><style>x</style></head><script>y</script>`)
    expect(metaCsp).toContain("require-trusted-types-for 'script'")
    expect(metaCsp).toContain('trusted-types default vue dompurify')
  })

  it('omits frame-ancestors from the meta CSP but keeps it in the header CSP', () => {
    const { metaCsp, headerCsp } = buildStandaloneCsp(`<head><style>x</style></head><script>y</script>`)
    expect(metaCsp).not.toContain('frame-ancestors')
    expect(headerCsp).toContain("frame-ancestors 'self'")
  })

  it('does not hash external scripts/styles (only inline)', () => {
    const html = `<head><link rel="stylesheet" href="/a.css"></head><body><script type="module" src="/a.js"></script></body>`
    const { scriptHashes, styleHashes } = buildStandaloneCsp(html)
    expect(scriptHashes).toEqual([])
    expect(styleHashes).toEqual([])
  })

  it('falls back to just self when there is no inline content', () => {
    const { metaCsp } = buildStandaloneCsp(`<head></head><body></body>`)
    expect(metaCsp).toContain("script-src 'self'")
    expect(metaCsp).toContain("style-src 'self'")
    expect(metaCsp).not.toContain('sha256-')
  })

  it('hashes multiple inline scripts', () => {
    const { scriptHashes } = buildStandaloneCsp(`<script>a</script><script>b</script>`)
    expect(scriptHashes).toEqual([sha256('a'), sha256('b')])
  })
})

describe('injectMeta', () => {
  it('inserts the meta tag immediately after <head>', () => {
    const out = injectMeta('<html><head><title>x</title></head></html>', "default-src 'self'")
    expect(out).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self'">/)
  })

  it('prepends the meta when there is no head element', () => {
    const out = injectMeta('<body>x</body>', "default-src 'self'")
    expect(out.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
  })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findHeaderViolations, parseSnippet, BASELINE, BACKEND_ONLY } from './check-security-headers.mjs'

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SNIPPET = readFileSync(join(repoRoot, 'containers/frontend/nginx/snippets/security-headers.conf'), 'utf8')

const line = (header, value) => `add_header ${header} "${value}" always;`
const baselineSnippet = () =>
  BASELINE.filter((e) => e.nginx !== null)
    .map((e) => line(e.header, e.nginx))
    .join('\n')

test('the snippet in the repo matches the baseline', () => {
  assert.deepEqual(findHeaderViolations(SNIPPET), [])
})

test('accepts a snippet built straight from the baseline', () => {
  assert.deepEqual(findHeaderViolations(baselineSnippet()), [])
})

test('ignores comments', () => {
  const withComment = `# add_header X-Made-Up "yes" always;\n${baselineSnippet()}`
  assert.deepEqual(findHeaderViolations(withComment), [])
})

// The drift this guard exists for: a header disappears from one surface.
test('flags a baseline header that is no longer sent', () => {
  const dropped = baselineSnippet().split('\n').filter((l) => !l.includes('X-Permitted-Cross-Domain-Policies')).join('\n')
  const violations = findHeaderViolations(dropped)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].header, 'X-Permitted-Cross-Domain-Policies')
  assert.match(violations[0].reason, /not sent by nginx/)
})

test('flags a weakened value', () => {
  const weakened = baselineSnippet().replace('max-age=31536000; includeSubDomains', 'max-age=300')
  const violations = findHeaderViolations(weakened)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].header, 'Strict-Transport-Security')
  assert.match(violations[0].reason, /value differs/)
})

// A new header is not wrong, but it must be a reviewed decision with the
// backend column considered, so it has to land in BASELINE too.
test('flags a header that is not in the baseline', () => {
  const extra = `${baselineSnippet()}\n${line('X-Download-Options', 'noopen')}`
  const violations = findHeaderViolations(extra)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].header, 'X-Download-Options')
  assert.match(violations[0].reason, /absent from BASELINE/)
})

test('flags a CSP in the shared snippet', () => {
  const withCsp = `${baselineSnippet()}\n${line('Content-Security-Policy', "default-src 'self'")}`
  const violations = findHeaderViolations(withCsp)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /csp-app\.conf/)
})

// Without `always` the header is dropped on 4xx/5xx, which is exactly where a
// prober looks.
test('flags an add_header without always', () => {
  const noAlways = `${baselineSnippet()}\nadd_header X-Content-Type-Options "nosniff";`
  const violations = findHeaderViolations(noAlways)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /without a quoted value and `always`/)
})

test('parses a quoted header name', () => {
  const { headers } = parseSnippet(line('"Referrer-Policy"', 'no-referrer'))
  assert.equal(headers.get('Referrer-Policy'), 'no-referrer')
})

test('every baseline entry records what the backend sends', () => {
  for (const entry of BASELINE) {
    assert.ok('backend' in entry, `${entry.header} has no backend column`)
    if (entry.nginx !== entry.backend) {
      assert.ok(entry.why, `${entry.header} differs between the surfaces without a reason`)
    }
  }
})

test('backend-only headers are not also claimed by the baseline', () => {
  const baselineHeaders = new Set(BASELINE.map((e) => e.header))
  for (const header of BACKEND_ONLY) {
    assert.ok(!baselineHeaders.has(header), `${header} is listed as backend-only and in BASELINE`)
  }
})

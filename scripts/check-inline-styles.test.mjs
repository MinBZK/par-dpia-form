import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findInlineStyleViolations } from './check-inline-styles.mjs'

// A `.vue`/`.html` literal `style=` attribute is parsed as an inline style and
// is blocked by `style-src 'self'` — must be flagged.
test('flags a literal style= attribute in a .vue template', () => {
  const violations = findInlineStyleViolations('<div style="color: red"></div>', '.vue')
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /literal/i)
  assert.equal(violations[0].line, 1)
})

// Vue applies `:style` via the CSSOM (not blocked by CSP), but project policy
// (#326) routes every dynamic value through a class / custom property, so a
// value-bearing binding is still a violation.
test('flags a value-bearing :style object binding', () => {
  const violations = findInlineStyleViolations('<div :style="{ color: x }"></div>', '.vue')
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /:style/i)
})

test('flags a :style bound to a non-literal expression', () => {
  const violations = findInlineStyleViolations('<div :style="someStyleObject"></div>', '.vue')
  assert.equal(violations.length, 1)
})

test('flags v-bind:style the same as :style', () => {
  const violations = findInlineStyleViolations('<div v-bind:style="{ width: w }"></div>', '.vue')
  assert.equal(violations.length, 1)
})

// The sanctioned escape hatch: a `:style` whose object only sets CSS custom
// properties (`--foo`). The actual cascade lives in a `'self'` stylesheet.
test('allows a :style binding that only sets custom properties', () => {
  const ok = findInlineStyleViolations(`<div :style="{ '--comment-top': entry.top + 'px' }"></div>`, '.vue')
  assert.equal(ok.length, 0)
})

test('allows a :style binding with multiple custom properties', () => {
  const ok = findInlineStyleViolations(`<div :style="{ '--a': a, '--b': b }"></div>`, '.vue')
  assert.equal(ok.length, 0)
})

test('does not flag a plain class attribute', () => {
  const ok = findInlineStyleViolations('<div class="form-field__fria-tag"></div>', '.vue')
  assert.equal(ok.length, 0)
})

// `<style>` SFC blocks are compiled to `'self'` CSS assets by Vite, so they are
// not a runtime inline style and must not be flagged.
test('does not flag a <style> block in a .vue SFC', () => {
  const ok = findInlineStyleViolations('<style>\n.foo { color: red }\n</style>', '.vue')
  assert.equal(ok.length, 0)
})

// A `<style>` element in served static HTML is a real inline stylesheet blocked
// by `style-src 'self'`.
test('flags a <style> element in an .html file', () => {
  const violations = findInlineStyleViolations('<head><style>.a{}</style></head>', '.html')
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /<style>/i)
})

// YAML content is rendered via `v-html`; an inline style there reaches the DOM
// as a parsed inline style.
test('flags inline style= inside YAML content', () => {
  const yaml = `description: |\n  <span style="font-weight: bold">x</span>\n`
  const violations = findInlineStyleViolations(yaml, '.yaml')
  assert.equal(violations.length, 1)
  assert.equal(violations[0].line, 2)
})

// Programmatic mutation that writes the *style attribute* is CSP-relevant.
test('flags setAttribute("style", ...) in TypeScript', () => {
  const violations = findInlineStyleViolations(`el.setAttribute('style', 'color:red')`, '.ts')
  assert.equal(violations.length, 1)
})

test('flags cssText assignment in TypeScript', () => {
  const violations = findInlineStyleViolations('el.style.cssText = "color:red"', '.ts')
  assert.equal(violations.length, 1)
})

// CSSOM custom-property writes are not blocked by CSP — the project's own
// pattern (autoGrowTextarea) — must not be flagged.
test('allows el.style.setProperty for a custom property', () => {
  const ok = findInlineStyleViolations(`el.style.setProperty('--autogrow-height', '12px')`, '.ts')
  assert.equal(ok.length, 0)
})

test('reports the correct 1-based line number for a multi-line file', () => {
  const content = '<template>\n  <div>\n    <p style="margin:0">x</p>\n  </div>\n</template>'
  const violations = findInlineStyleViolations(content, '.vue')
  assert.equal(violations.length, 1)
  assert.equal(violations[0].line, 3)
})

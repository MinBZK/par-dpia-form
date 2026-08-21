import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractVHtmlBindings,
  extractVBindInnerHtmlBindings,
  extractDomHtmlSinks,
  resolveDeclarationHash,
  findUnlistedBindings,
} from './check-vhtml.mjs'

test('extractVHtmlBindings finds double- and single-quoted bindings', () => {
  const content = [
    '<p v-html="task.description"></p>',
    "<span v-html='option.label'></span>",
    '<div>plain</div>',
  ].join('\n')
  const b = extractVHtmlBindings(content)
  assert.deepEqual(b.map(x => x.expr), ['task.description', 'option.label'])
  assert.equal(b[0].line, 1)
  assert.equal(b[1].line, 2)
})

test('extractVHtmlBindings does not match a bare v-html mention without a binding', () => {
  const content = '<!-- render as text, not v-html -->'
  assert.deepEqual(extractVHtmlBindings(content), [])
})

test('extractVHtmlBindings finds two bindings on one line', () => {
  const content = '<a v-html="x"></a><b v-html="y"></b>'
  assert.deepEqual(extractVHtmlBindings(content).map(x => x.expr), ['x', 'y'])
})

test('findUnlistedBindings returns sites not present in the baseline', () => {
  const baseline = ['a.vue::x', 'a.vue::y']
  const current = ['a.vue::x', 'a.vue::y', 'a.vue::z']
  assert.deepEqual(findUnlistedBindings(current, baseline), ['a.vue::z'])
})

test('findUnlistedBindings respects duplicate counts (adding a second identical sink fails)', () => {
  const baseline = ['a.vue::x']
  const current = ['a.vue::x', 'a.vue::x']
  assert.deepEqual(findUnlistedBindings(current, baseline), ['a.vue::x'])
})

test('findUnlistedBindings is empty when every current site is baselined', () => {
  assert.deepEqual(findUnlistedBindings(['a::x'], ['a::x', 'b::y']), [])
})

test('extractVHtmlBindings finds an expression that spans two lines, with the starting line number', () => {
  const content = ['<div', '  v-html="a +', '    b">', '</div>'].join('\n')
  const b = extractVHtmlBindings(content)
  assert.deepEqual(b.map(x => x.expr), ['a +\n    b'])
  assert.equal(b[0].line, 2)
})

test('extractVHtmlBindings finds an unquoted binding', () => {
  const content = '<div v-html=evil></div>'
  assert.deepEqual(extractVHtmlBindings(content).map(x => x.expr), ['evil'])
})

test('extractVBindInnerHtmlBindings finds a v-bind object that sets innerHTML', () => {
  const content = '<div v-bind="{ innerHTML: evil }"></div>'
  const b = extractVBindInnerHtmlBindings(content)
  assert.equal(b.length, 1)
  assert.equal(b[0].expr, '{ innerHTML: evil }')
})

test('extractVBindInnerHtmlBindings ignores a v-bind object without innerHTML', () => {
  const content = '<div v-bind="{ class: foo }"></div>'
  assert.deepEqual(extractVBindInnerHtmlBindings(content), [])
})

test('extractDomHtmlSinks finds innerHTML, outerHTML and insertAdjacentHTML assignments', () => {
  const content = [
    'el.innerHTML = html',
    'el.outerHTML = html',
    "el.insertAdjacentHTML('beforeend', html)",
  ].join('\n')
  const sinks = extractDomHtmlSinks(content)
  assert.deepEqual(
    sinks.map(s => s.kind),
    ['innerHTML', 'outerHTML', 'insertAdjacentHTML'],
  )
  assert.equal(sinks[0].expr, 'html')
  assert.equal(sinks[2].expr, "'beforeend', html")
})

test('extractDomHtmlSinks does not match a strict-equality comparison', () => {
  const content = 'if (el.innerHTML === expected) return'
  assert.deepEqual(extractDomHtmlSinks(content), [])
})

test('extractDomHtmlSinks does not match a plain read of .innerHTML', () => {
  const content = 'return el.innerHTML'
  assert.deepEqual(extractDomHtmlSinks(content), [])
})

test('resolveDeclarationHash resolves a computed(...) declaration to a stable hash', () => {
  const content = [
    'const renderedHtml = computed(() => {',
    '  return renderMarkdownToHtml(value.value)',
    '})',
  ].join('\n')
  const hash = resolveDeclarationHash(content, 'renderedHtml')
  assert.match(hash, /^[0-9a-f]{12}$/)
  assert.equal(hash, resolveDeclarationHash(content, 'renderedHtml'))
})

test('resolveDeclarationHash changes when the declaration body changes', () => {
  const before = 'const renderedHtml = computed(() => renderMarkdownToHtml(value.value))'
  const after = 'const renderedHtml = computed(() => value.value)'
  assert.notEqual(
    resolveDeclarationHash(before, 'renderedHtml'),
    resolveDeclarationHash(after, 'renderedHtml'),
  )
})

test('resolveDeclarationHash returns null for an identifier with no local declaration (e.g. a prop)', () => {
  const content = 'const props = defineProps<{ description?: string }>()'
  assert.equal(resolveDeclarationHash(content, 'description'), null)
})

test('resolveDeclarationHash returns null for a non-identifier expression', () => {
  assert.equal(resolveDeclarationHash('const x = 1', 'task.description'), null)
})

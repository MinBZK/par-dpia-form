import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractVHtmlBindings, findUnlistedBindings } from './check-vhtml.mjs'

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

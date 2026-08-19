import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectPins, compareVersions, behindEntries } from './check-package-manager-updates.mjs'

test('compareVersions orders X.Y.Z semantically', () => {
  assert.ok(compareVersions('11.13.0', '11.14.0') < 0)
  assert.ok(compareVersions('0.36.0', '0.35.0') > 0)
  assert.equal(compareVersions('11.13.0', '11.13.0'), 0)
  assert.ok(compareVersions('11.9.0', '11.10.0') < 0) // numeric, not lexical
})

test('collectPins extracts pnpm/corepack versions and de-duplicates', () => {
  const texts = [
    '"packageManager": "pnpm@11.13.0+sha512.abc"',
    'RUN npm install --global corepack@0.35.0 && corepack enable',
    'RUN corepack prepare pnpm@11.13.0+sha512.def --activate',
  ]
  const pins = collectPins(texts)
  assert.deepEqual(pins.get('pnpm'), ['11.13.0'])
  assert.deepEqual(pins.get('corepack'), ['0.35.0'])
})

test('collectPins keeps distinct versions sorted', () => {
  const pins = collectPins(['pnpm@11.14.0', 'pnpm@11.13.0'])
  assert.deepEqual(pins.get('pnpm'), ['11.13.0', '11.14.0'])
})

test('behindEntries flags a pin below the latest, ignores current ones', () => {
  const pins = new Map([['pnpm', ['11.13.0']], ['corepack', ['0.35.0']]])
  const behind = behindEntries(pins, { pnpm: '11.14.0', corepack: '0.35.0' })
  assert.deepEqual(behind, [{ name: 'pnpm', pinned: ['11.13.0'], latest: '11.14.0' }])
})

test('behindEntries skips a package with no known latest', () => {
  const pins = new Map([['pnpm', ['11.13.0']]])
  assert.deepEqual(behindEntries(pins, {}), [])
})

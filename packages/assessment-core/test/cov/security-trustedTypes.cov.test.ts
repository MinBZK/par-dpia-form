import { afterEach, expect, it, vi } from 'vitest'

import { installTrustedTypesPolicy } from '../../src/security/trustedTypes'

// jsdom has no `trustedTypes`, so each test that needs it installs a fake factory.
function fakeTrustedTypes() {
  let defaultPolicy: unknown = null
  return {
    get defaultPolicy() {
      return defaultPolicy
    },
    createPolicy: vi.fn((name: string, rules: { createHTML: (s: string) => string }) => {
      const policy = { name, ...rules }
      if (name === 'default') defaultPolicy = policy
      return policy
    }),
  }
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).trustedTypes
})

it('is a no-op (no throw) when Trusted Types is unsupported', () => {
  delete (globalThis as Record<string, unknown>).trustedTypes
  expect(() => installTrustedTypesPolicy()).not.toThrow()
})

it('registers a "default" policy when Trusted Types is supported', () => {
  const tt = fakeTrustedTypes()
  ;(globalThis as Record<string, unknown>).trustedTypes = tt
  installTrustedTypesPolicy()
  expect(tt.createPolicy).toHaveBeenCalledWith('default', expect.anything())
})

it('the default policy sanitizes dangerous HTML (DOMPurify) but keeps safe markup', () => {
  const tt = fakeTrustedTypes()
  ;(globalThis as Record<string, unknown>).trustedTypes = tt
  installTrustedTypesPolicy()
  const rules = tt.createPolicy.mock.calls[0][1]
  const out = rules.createHTML('<img src=x onerror="alert(1)"><b>ok</b><a href="https://x" target="_blank">l</a>')
  expect(out).not.toContain('onerror')
  expect(out).toContain('<b>ok</b>')
  expect(out).toContain('target="_blank"')
})

it('does not re-register when a default policy already exists', () => {
  const tt = fakeTrustedTypes()
  ;(globalThis as Record<string, unknown>).trustedTypes = tt
  installTrustedTypesPolicy()
  installTrustedTypesPolicy()
  expect(tt.createPolicy).toHaveBeenCalledTimes(1)
})

it('does nothing when trustedTypes exists but lacks createPolicy', () => {
  ;(globalThis as Record<string, unknown>).trustedTypes = {}
  expect(() => installTrustedTypesPolicy()).not.toThrow()
})

import DOMPurify from 'dompurify'

// Minimal shape of the Trusted Types factory we rely on (the DOM lib types are
// not guaranteed present in every tsconfig, and the factory is absent in
// Firefox/Safari/jsdom).
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML: (input: string) => string }): unknown
  defaultPolicy: unknown
}

/**
 * Register a Trusted Types `default` policy that routes every DOM sink which
 * receives a string (Vue `v-html`, third-party `innerHTML`, …) through
 * DOMPurify. Combined with `require-trusted-types-for 'script'` in the CSP this
 * becomes a single, browser-enforced sanitization chokepoint for DOM XSS —
 * defense-in-depth on top of the markdown allowlist renderer.
 *
 * No-op where Trusted Types is unsupported, so it is safe to call unconditionally
 * at bootstrap. Idempotent: a second call (e.g. HMR) does not re-register.
 */
export function installTrustedTypesPolicy(): void {
  const tt = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes
  if (!tt || typeof tt.createPolicy !== 'function') return
  if (tt.defaultPolicy) return
  tt.createPolicy('default', {
    // `target` (and its paired `rel`) are used by rendered markdown links.
    createHTML: (input) => DOMPurify.sanitize(input, { ADD_ATTR: ['target'] }),
  })
}

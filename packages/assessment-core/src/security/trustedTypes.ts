import DOMPurify from 'dompurify'

// Minimal shape of the Trusted Types factory we rely on (the DOM lib types are
// not guaranteed present in every tsconfig, and the factory is absent in
// Firefox/Safari/jsdom).
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML: (input: string) => string }): unknown
  defaultPolicy: unknown
}

/**
 * Register a Trusted Types `default` policy that routes raw `innerHTML` sinks
 * through DOMPurify. Combined with `require-trusted-types-for 'script'` in the
 * CSP this sanitizes strings assigned directly to a DOM sink (e.g. stripHtml.ts).
 *
 * IMPORTANT — this does NOT cover Vue `v-html`. Vue registers its own Trusted
 * Types policy named `vue` (a no-op passthrough, `createHTML: (v) => v`) and
 * wraps every `v-html`/innerHTML assignment through it, so the browser never
 * falls back to this `default` policy for those sinks. v-html output must
 * therefore be sanitized at the call site (escapeHtml/stripHtml or the markdown
 * allowlist renderer); do not rely on this policy as a v-html safety net.
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

import type { TestJwks } from './testJwks.js'

// Populated by test/setup.ts before any test module loads. Tests import this
// to get the signer + JWKS metadata without needing access to setup internals.
export const testContext: { jwks: TestJwks | null } = { jwks: null }

export function getJwks(): TestJwks {
  if (!testContext.jwks) {
    throw new Error('Test JWKS not initialised — is test/setup.ts configured as a setupFile?')
  }
  return testContext.jwks
}

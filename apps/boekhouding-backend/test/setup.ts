// Global test setup — runs BEFORE any test file imports src/* modules.
//
// Two responsibilities:
//  1. Spin up a loopback JWKS server + expose a token signer via testContext.
//  2. Point backend env vars at the test DB + test JWKS so config.ts / auth.ts
//     pick them up when they're imported by the test files.
//
// No src/* imports may happen at the top of this file — env must be set first.
import { startTestJwks } from './helpers/testJwks.js'
import { testContext } from './helpers/testContext.js'

const jwks = await startTestJwks()
testContext.jwks = jwks

process.env.OIDC_URL = jwks.oidcUrl
process.env.OIDC_INTERNAL_URL = jwks.oidcUrl
process.env.OIDC_REALM = jwks.realm
process.env.OIDC_PUBLIC_CLIENT_ID = jwks.audience

if (!process.env.DATABASE_SERVER_FULL) {
  process.env.DATABASE_SERVER_FULL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://parassessment:parassessment@localhost:5432/parassessment_test'
}

// Silence Fastify logger noise during tests.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent'

// Run migrations once per test file (idempotent — drizzle skips applied ones).
const { runMigrations } = await import('./helpers/testDb.js')
await runMigrations(process.env.DATABASE_SERVER_FULL)

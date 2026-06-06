// Unit coverage for src/config.ts.
//
// config.ts reads process.env at module-evaluation time and derives a frozen
// config object plus a parseCorsOrigin() branch. Because all logic runs at
// import, we exercise every branch (every `||` fallback, the CORS ternary, and
// the filter(Boolean) empty-segment drop) by setting env vars and re-importing
// the module via vi.resetModules() + dynamic import().
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { vi } from 'vitest'

// Env keys config.ts inspects. We snapshot and restore them so other test
// files (and setup.ts's values) are unaffected.
const ENV_KEYS = [
  'OIDC_URL',
  'OIDC_INTERNAL_URL',
  'OIDC_REALM',
  'OIDC_PUBLIC_CLIENT_ID',
  'CORS_ORIGIN',
  'PUBLIC_HOST',
  'PORT',
  'HOST',
  'DATABASE_SERVER_FULL',
] as const

const originalEnv: Record<string, string | undefined> = {}
for (const key of ENV_KEYS) originalEnv[key] = process.env[key]

function clearConfigEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
}

async function loadConfig() {
  vi.resetModules()
  const mod = await import('../../src/config.js')
  return mod.config
}

beforeEach(() => {
  clearConfigEnv()
})

afterAll(() => {
  // Restore the env exactly as setup.ts left it for any later-importing module.
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]!
  }
})

describe('config — defaults when no env vars are set', () => {
  it('falls back to all built-in defaults', async () => {
    const config = await loadConfig()

    expect(config.port).toBe(3000)
    expect(config.host).toBe('0.0.0.0')
    expect(config.databaseUrl).toBe(
      'postgresql://parassessment:parassessment@localhost:5432/parassessment',
    )
    // CORS_ORIGIN and PUBLIC_HOST unset -> final string literal fallback.
    expect(config.cors.origin).toBe('http://localhost:5174')
    expect(config.cors.credentials).toBe(true)
    // OIDC_URL default + OIDC_REALM default. OIDC_INTERNAL_URL unset -> oidcUrl.
    expect(config.keycloak.issuer).toBe('http://localhost:8080/realms/assessment-boekhouding')
    expect(config.keycloak.jwksUri).toBe(
      'http://localhost:8080/realms/assessment-boekhouding/protocol/openid-connect/certs',
    )
    expect(config.keycloak.audience).toBe('boekhouding-frontend')
  })
})

describe('config — env vars override defaults', () => {
  it('uses PORT, HOST, DATABASE_SERVER_FULL and OIDC_PUBLIC_CLIENT_ID when set', async () => {
    process.env.PORT = '8081'
    process.env.HOST = '127.0.0.1'
    process.env.DATABASE_SERVER_FULL = 'postgresql://u:p@db:5432/mydb'
    process.env.OIDC_PUBLIC_CLIENT_ID = 'my-client'

    const config = await loadConfig()

    expect(config.port).toBe(8081)
    expect(config.host).toBe('127.0.0.1')
    expect(config.databaseUrl).toBe('postgresql://u:p@db:5432/mydb')
    expect(config.keycloak.audience).toBe('my-client')
  })

  it('parses PORT with base 10 (leading zeros are decimal, not octal)', async () => {
    process.env.PORT = '0080'
    const config = await loadConfig()
    expect(config.port).toBe(80)
  })
})

describe('config — OIDC URL derivation', () => {
  it('uses OIDC_URL for both issuer and jwks when OIDC_INTERNAL_URL is unset', async () => {
    process.env.OIDC_URL = 'https://login.example.com'
    process.env.OIDC_REALM = 'my-realm'

    const config = await loadConfig()

    expect(config.keycloak.issuer).toBe('https://login.example.com/realms/my-realm')
    // OIDC_INTERNAL_URL unset -> jwksUri derives from oidcUrl.
    expect(config.keycloak.jwksUri).toBe(
      'https://login.example.com/realms/my-realm/protocol/openid-connect/certs',
    )
  })

  it('uses OIDC_INTERNAL_URL for jwks while issuer keeps the public OIDC_URL', async () => {
    process.env.OIDC_URL = 'https://public.example.com'
    process.env.OIDC_INTERNAL_URL = 'http://keycloak.internal:8080'
    process.env.OIDC_REALM = 'realm-x'

    const config = await loadConfig()

    expect(config.keycloak.issuer).toBe('https://public.example.com/realms/realm-x')
    expect(config.keycloak.jwksUri).toBe(
      'http://keycloak.internal:8080/realms/realm-x/protocol/openid-connect/certs',
    )
  })
})

describe('config — parseCorsOrigin', () => {
  it('returns a single string when CORS_ORIGIN has no comma', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com'
    const config = await loadConfig()
    expect(config.cors.origin).toBe('https://app.example.com')
  })

  it('returns a trimmed array when CORS_ORIGIN is comma-separated', async () => {
    process.env.CORS_ORIGIN = 'https://a.example.com, https://b.example.com ,https://c.example.com'
    const config = await loadConfig()
    expect(config.cors.origin).toEqual([
      'https://a.example.com',
      'https://b.example.com',
      'https://c.example.com',
    ])
  })

  it('drops empty segments via filter(Boolean) (trailing comma / blanks)', async () => {
    process.env.CORS_ORIGIN = 'https://a.example.com,, ,https://b.example.com,'
    const config = await loadConfig()
    expect(config.cors.origin).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
  })

  it('falls back to PUBLIC_HOST when CORS_ORIGIN is unset', async () => {
    process.env.PUBLIC_HOST = 'https://host.example.com'
    const config = await loadConfig()
    expect(config.cors.origin).toBe('https://host.example.com')
  })

  it('uses PUBLIC_HOST as a comma-separated list when CORS_ORIGIN is unset', async () => {
    // Exercises the comma branch fed by the PUBLIC_HOST fallback.
    process.env.PUBLIC_HOST = 'https://one.example.com,https://two.example.com'
    const config = await loadConfig()
    expect(config.cors.origin).toEqual([
      'https://one.example.com',
      'https://two.example.com',
    ])
  })

  it('prefers CORS_ORIGIN over PUBLIC_HOST when both are set', async () => {
    process.env.CORS_ORIGIN = 'https://cors.example.com'
    process.env.PUBLIC_HOST = 'https://ignored.example.com'
    const config = await loadConfig()
    expect(config.cors.origin).toBe('https://cors.example.com')
  })
})

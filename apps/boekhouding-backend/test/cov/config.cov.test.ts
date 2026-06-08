// config.ts runs all logic at module-evaluation, so each case sets env vars and
// re-imports via vi.resetModules() + dynamic import() to re-trigger evaluation.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { vi } from 'vitest'

// Snapshot/restore these so we don't pollute env for other test files (setup.ts).
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
  'TRUST_PROXY',
  'DB_POOL_MAX',
  'DB_CONNECT_TIMEOUT',
  'DB_IDLE_TIMEOUT',
  'WEB_CONCURRENCY',
  'RATE_LIMIT_MAX',
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
    expect(config.cors.origin).toBe('http://localhost:5174')
    expect(config.cors.credentials).toBe(true)
    expect(config.publicUrl).toBe('http://localhost:5174')
    expect(config.keycloak.issuer).toBe('http://localhost:8080/realms/invulhulpen')
    expect(config.keycloak.jwksUri).toBe(
      'http://localhost:8080/realms/invulhulpen/protocol/openid-connect/certs',
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
    expect(config.publicUrl).toBe('https://a.example.com')
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

describe('config — parseTrustProxy', () => {
  it('defaults to 1 hop when TRUST_PROXY is unset', async () => {
    const config = await loadConfig()
    expect(config.trustProxy).toBe(1)
  })

  it('coerces a numeric TRUST_PROXY to a number (hop count)', async () => {
    process.env.TRUST_PROXY = '2'
    const config = await loadConfig()
    expect(config.trustProxy).toBe(2)
  })

  it('passes a non-numeric TRUST_PROXY through as a CIDR/IP string', async () => {
    process.env.TRUST_PROXY = '10.0.0.0/8'
    const config = await loadConfig()
    expect(config.trustProxy).toBe('10.0.0.0/8')
  })
})

describe('config — db pool (parsePositiveInt with clamping)', () => {
  it('uses safe defaults when the pool env vars are unset', async () => {
    const config = await loadConfig()
    expect(config.db).toEqual({ max: 9, connectTimeout: 10, idleTimeout: 30 })
  })

  it('accepts a valid override within range', async () => {
    process.env.DB_POOL_MAX = '12'
    process.env.DB_CONNECT_TIMEOUT = '5'
    process.env.DB_IDLE_TIMEOUT = '120'
    const config = await loadConfig()
    expect(config.db).toEqual({ max: 12, connectTimeout: 5, idleTimeout: 120 })
  })

  it('falls back to the default for a non-numeric value', async () => {
    process.env.DB_POOL_MAX = 'abc'
    const config = await loadConfig()
    expect(config.db.max).toBe(9)
  })

  it('falls back to the default for a value below 1 (e.g. 0)', async () => {
    process.env.DB_POOL_MAX = '0'
    const config = await loadConfig()
    expect(config.db.max).toBe(9)
  })

  it('clamps a value above the per-user cap (pool capped at 20)', async () => {
    process.env.DB_POOL_MAX = '500'
    const config = await loadConfig()
    expect(config.db.max).toBe(20)
  })
})

describe('config — webConcurrency (parseWebConcurrency)', () => {
  it('returns null when WEB_CONCURRENCY is unset (entry point defaults to 1 worker)', async () => {
    const config = await loadConfig()
    expect(config.webConcurrency).toBeNull()
  })

  it('returns the parsed worker count when set to a valid value', async () => {
    process.env.WEB_CONCURRENCY = '4'
    const config = await loadConfig()
    expect(config.webConcurrency).toBe(4)
  })

  it('returns null for a non-numeric value', async () => {
    process.env.WEB_CONCURRENCY = 'abc'
    const config = await loadConfig()
    expect(config.webConcurrency).toBeNull()
  })

  it('returns null for a value below 1 (e.g. 0)', async () => {
    process.env.WEB_CONCURRENCY = '0'
    const config = await loadConfig()
    expect(config.webConcurrency).toBeNull()
  })

  it('clamps an excessive value to 64 (prevents a fork bomb)', async () => {
    process.env.WEB_CONCURRENCY = '100'
    const config = await loadConfig()
    expect(config.webConcurrency).toBe(64)
  })
})

describe('config — rateLimit', () => {
  it('defaults the rate-limit max to 300', async () => {
    const config = await loadConfig()
    expect(config.rateLimit.max).toBe(300)
  })

  it('honours a RATE_LIMIT_MAX override', async () => {
    process.env.RATE_LIMIT_MAX = '500'
    const config = await loadConfig()
    expect(config.rateLimit.max).toBe(500)
  })
})

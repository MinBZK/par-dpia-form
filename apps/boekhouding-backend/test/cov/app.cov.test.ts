import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, API_VERSION } from '../../src/app.js'
import { config } from '../../src/config.js'
import { getJwks } from '../helpers/testContext.js'
import { randomUUID } from 'node:crypto'

let app: FastifyInstance

beforeAll(async () => {
  // exposeApiDocs is off by default; enable it here to exercise the Swagger UI
  // + /api/openapi.json routes below.
  app = await buildApp({ logger: false, exposeApiDocs: true })

  app.get('/__cov/throw-no-status', async () => {
    throw new Error('iets ging mis')
  })

  app.get('/__cov/throw-400', async () => {
    const err = new Error('veld ontbreekt') as Error & { statusCode?: number }
    err.statusCode = 400
    throw err
  })

  app.get('/__cov/throw-422-empty', async () => {
    const err = new Error('') as Error & { statusCode?: number }
    err.statusCode = 422
    throw err
  })

  app.get('/__cov/throw-429', async () => {
    const err = new Error('rate') as Error & { statusCode?: number }
    err.statusCode = 429
    throw err
  })

  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('buildApp — options handling', () => {
  it('uses the default {} options object when called with no argument', async () => {
    const defaultApp = await buildApp()
    await defaultApp.ready()
    try {
      const res = await defaultApp.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
    } finally {
      await defaultApp.close()
    }
  })

  it('defaults logger to true when options has no logger key (options.logger ?? true)', async () => {
    const defaultApp = await buildApp({})
    await defaultApp.ready()
    try {
      const res = await defaultApp.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
    } finally {
      await defaultApp.close()
    }
  })

})

describe('/api/health - readiness during shutdown', () => {
  it('reports 503 once beginShutdown() is called, so Kubernetes withdraws the pod', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const before = await app.inject({ method: 'GET', url: '/api/health' })
      expect(before.statusCode).toBe(200)
      expect(before.json().status).toBe('ok')

      app.beginShutdown()

      const after = await app.inject({ method: 'GET', url: '/api/health' })
      expect(after.statusCode).toBe(503)
      expect(after.json().status).toBe('shutting_down')
    } finally {
      await app.close()
    }
  })
})

describe('API_VERSION constant', () => {
  it('is exported as 1.0.0', () => {
    expect(API_VERSION).toBe('1.0.0')
  })
})

describe('onSend hook — response headers', () => {
  it('sets API-Version and Cache-Control on every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['api-version']).toBe(API_VERSION)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.json()).toEqual({ status: 'ok', apiVersion: API_VERSION, version: 'dev', commit: 'dev' })
  })

  it('applies helmet security headers (CSP) on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  })
})

describe('/api/health — version fields', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns apiVersion and defaults version/commit to "dev" when env is unset', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.json()).toEqual({ status: 'ok', apiVersion: API_VERSION, version: 'dev', commit: 'dev' })
  })

  it('reflects APP_VERSION and APP_COMMIT from the environment', async () => {
    vi.stubEnv('APP_VERSION', 'v2026.6.14')
    vi.stubEnv('APP_COMMIT', 'abc1234')
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.json()).toEqual({ status: 'ok', apiVersion: API_VERSION, version: 'v2026.6.14', commit: 'abc1234' })
  })
})

describe('static utility routes', () => {
  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', apiVersion: API_VERSION, version: 'dev', commit: 'dev' })
  })

  it('GET /.well-known/security.txt serves our own file, not a redirect', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/security.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    // Cache-Control is stamped no-store by the onSend hook above, for every
    // response including this one: suboptimal for a cacheable file, but a
    // deliberate trade-off (see the comment on the route) rather than a bug.
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toContain('Policy: https://github.com/MinBZK/par-dpia-form/blob/main/SECURITY.md')
    expect(res.body).toContain('Contact: mailto:security@ncsc.nl')
    expect(res.body).toContain(`Canonical: ${config.publicUrl}/.well-known/security.txt`)
    expect(res.body).not.toContain('${')
  })

  it('GET /api/openapi.json returns the generated OpenAPI document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    expect(res.statusCode).toBe(200)
    const doc = res.json()
    expect(doc.info.title).toBe('Invulhulpen API')
    expect(doc.info.version).toBe(API_VERSION)
    expect(doc.info.contact.url).toBe(config.publicUrl)
  })

  it('serves the Swagger UI at /api/docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs/' })
    expect([200, 302]).toContain(res.statusCode)
  })
})

describe('registered route prefixes', () => {
  it('mounts the protected /api/v1/projects routes (401 without auth)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' })
    expect(res.statusCode).toBe(401)
  })

  it('mounts the protected /api/v1/assessments routes (401 without auth)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/assessments/00000000-0000-0000-0000-000000000000' })
    expect(res.statusCode).toBe(401)
  })
})

describe('error handler — RFC 9457 problem+json', () => {
  it('returns 500 with generic detail when the error has no statusCode', async () => {
    const res = await app.inject({ method: 'GET', url: '/__cov/throw-no-status' })
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toEqual({
      type: 'https://httpproblems.com/http-status/500',
      title: 'Interne serverfout',
      status: 500,
      detail: 'Er is een onverwachte fout opgetreden.',
      instance: '/__cov/throw-no-status',
    })
  })

  it('returns the original 4xx status with the error message as detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/__cov/throw-400' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toEqual({
      type: 'https://httpproblems.com/http-status/400',
      title: 'Verzoek mislukt',
      status: 400,
      detail: 'veld ontbreekt',
      instance: '/__cov/throw-400',
    })
  })

  it('falls back to "Onbekende fout" when a 4xx error has an empty message', async () => {
    const res = await app.inject({ method: 'GET', url: '/__cov/throw-422-empty' })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({
      type: 'https://httpproblems.com/http-status/422',
      title: 'Verzoek mislukt',
      status: 422,
      detail: 'Onbekende fout',
      instance: '/__cov/throw-422-empty',
    })
  })

  it('returns the dedicated 429 problem document (status === 429 branch)', async () => {
    const res = await app.inject({ method: 'GET', url: '/__cov/throw-429' })
    expect(res.statusCode).toBe(429)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toEqual({
      type: 'https://httpproblems.com/http-status/429',
      title: 'Te veel verzoeken',
      status: 429,
      detail: 'Maximaal aantal verzoeken overschreden. Probeer het later opnieuw.',
      instance: '/__cov/throw-429',
    })
  })
})

describe('rate limit — emmer per ingelogde gebruiker, anders per IP', () => {
  const jwks = getJwks()

  // Each test needs a pristine bucket store, so it builds its own app instead of
  // sharing the module-level one.
  async function limitedApp() {
    const instance = await buildApp({ logger: false })
    await instance.ready()
    return instance
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` }
  }

  function signedToken() {
    const sub = randomUUID()
    return jwks.signToken({ sub, email: `${sub}@example.com` })
  }

  it('keys an unauthenticated request on the IP bucket', async () => {
    const app = await limitedApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' })
      expect(res.headers['x-ratelimit-limit']).toBe(String(config.rateLimit.max))
    } finally {
      await app.close()
    }
  })

  it('keys a request with a verified token on the per-user bucket', async () => {
    const app = await limitedApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(await signedToken()) })
      expect(res.statusCode).toBe(200)
      expect(res.headers['x-ratelimit-limit']).toBe(String(config.rateLimit.userMax))
    } finally {
      await app.close()
    }
  })

  it('gives two users on the same IP separate buckets', async () => {
    const app = await limitedApp()
    try {
      const one = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(await signedToken()) })
      const two = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(await signedToken()) })
      const remaining = String(config.rateLimit.userMax - 1)
      expect(one.headers['x-ratelimit-remaining']).toBe(remaining)
      expect(two.headers['x-ratelimit-remaining']).toBe(remaining)
    } finally {
      await app.close()
    }
  })

  it('falls back to the IP bucket for an unverifiable token, so buckets cannot be minted', async () => {
    const app = await limitedApp()
    try {
      // Unsigned "alg: none" token with an invented sub, assembled here so no
      // JWT-shaped literal ends up in the source (gitleaks).
      const forged = ['{"alg":"none"}', '{"sub":"attacker"}']
        .map((part) => Buffer.from(part).toString('base64url'))
        .join('.') + '.'
      const res = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: bearer(forged) })
      expect(res.statusCode).toBe(401)
      expect(res.headers['x-ratelimit-limit']).toBe(String(config.rateLimit.max))
    } finally {
      await app.close()
    }
  })

  it('answers with the 429 problem document once the IP bucket is empty', async () => {
    const app = await limitedApp()
    try {
      for (let i = 0; i < config.rateLimit.max; i++) {
        await app.inject({ method: 'GET', url: '/api/health' })
      }
      const res = await app.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(429)
      expect(res.json()).toMatchObject({ status: 429, title: 'Te veel verzoeken' })
    } finally {
      await app.close()
    }
  })
})

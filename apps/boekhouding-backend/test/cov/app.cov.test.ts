import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp, API_VERSION } from '../../src/app.js'
import { config } from '../../src/config.js'

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
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('applies helmet security headers (CSP) on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  })
})

describe('static utility routes', () => {
  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('GET /.well-known/security.txt redirects 301 to NCSC', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/security.txt' })
    expect(res.statusCode).toBe(301)
    expect(res.headers.location).toBe('https://www.ncsc.nl/.well-known/security.txt')
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

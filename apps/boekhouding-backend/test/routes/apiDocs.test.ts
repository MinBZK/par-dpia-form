// /api/docs + /api/openapi.json must be gated so they aren't anonymously reachable in production.
import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('API docs exposure', () => {
  it('serves the spec and UI when exposeApiDocs is true', async () => {
    app = await buildApp({ logger: false, exposeApiDocs: true })
    await app.ready()

    const spec = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    const ui = await app.inject({ method: 'GET', url: '/api/docs' })

    expect(spec.statusCode).toBe(200)
    expect(ui.statusCode).not.toBe(404) // 200 or 302 to /api/docs/
  })

  it('returns 404 for the spec and UI when exposeApiDocs is false', async () => {
    app = await buildApp({ logger: false, exposeApiDocs: false })
    await app.ready()

    const spec = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    const ui = await app.inject({ method: 'GET', url: '/api/docs' })

    expect(spec.statusCode).toBe(404)
    expect(ui.statusCode).toBe(404)
  })

  it('still serves protected routes with auth enforced when docs are disabled', async () => {
    app = await buildApp({ logger: false, exposeApiDocs: false })
    await app.ready()

    // Gating swagger must not break the data routes — auth still applies.
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' })
    expect(res.statusCode).toBe(401)
  })
})

// Integration tests for POST /api/v1/chat.
//
// Runs the real Fastify app via app.inject() with real JWTs, and stubs global
// fetch so no test ever reaches VLAM — a live call would spend someone's budget
// and make the suite depend on an external service.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { config } from '../../src/config.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, type SeededUser } from '../helpers/fixtures.js'

// Built rather than written as a literal, and deliberately low-entropy: a
// realistic-looking fixture trips the gitleaks pre-commit hook.
const KEY = 'sleutel-'.repeat(4)
const CHAT_URL = '/api/v1/chat'

let app: FastifyInstance
let user: SeededUser
let token: string
const jwks = getJwks()

const realFetch = globalThis.fetch
const originalVlam = { ...config.chat.vlam }

function headers(extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, 'x-vlam-api-key': KEY, ...extra }
}

const body = { messages: [{ role: 'user', content: 'Wat is een AIIA?' }] }

/** Stub global fetch with a single canned outcome. */
function stubFetch(outcome: Response | Error) {
  const fn = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome
    return outcome
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function vlamResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeAll(async () => {
  app = await buildApp({ logger: false, chatEnabled: true })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  globalThis.fetch = realFetch
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
  user = await createUser()
  token = await jwks.signToken({ sub: user.oidcSub, email: user.email })
  config.chat.vlam.baseUrl = 'https://vlam.example/v1'
  config.chat.vlam.modelId = 'test-model'
  config.chat.vlam.timeout = 30
})

afterEach(() => {
  globalThis.fetch = realFetch
  Object.assign(config.chat.vlam, originalVlam)
})

describe('POST /api/v1/chat', () => {
  it('is absent when the chat flag is off', async () => {
    const off = await buildApp({ logger: false, chatEnabled: false })
    await off.ready()
    const res = await off.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(404)
    await off.close()
  })

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: CHAT_URL,
      headers: { 'x-vlam-api-key': KEY },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })

  it('refuses a request without a key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: CHAT_URL,
      headers: { authorization: `Bearer ${token}` },
      payload: body,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('x-vlam-api-key')
  })

  it.each([
    ['too short', 'short'],
    ['with whitespace', 'vlam key with spaces 0123456789'],
    ['non-ascii', 'vlam-sleutel-méér-dan-twintig'],
    ['too long', 'k'.repeat(513)],
  ])('refuses a key %s', async (_label, key) => {
    const res = await app.inject({
      method: 'POST',
      url: CHAT_URL,
      headers: headers({ 'x-vlam-api-key': key }),
      payload: body,
    })
    expect(res.statusCode).toBe(400)
    // The rejection never echoes the value back.
    expect(res.body).not.toContain(key)
  })

  it('reports 503 when the environment has no VLAM configured', async () => {
    config.chat.vlam.baseUrl = ''
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(503)
  })

  it('reports 503 when the model is missing', async () => {
    config.chat.vlam.modelId = ''
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(503)
  })

  it('rejects a body that is not a conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: CHAT_URL,
      headers: headers(),
      payload: { messages: [{ role: 'wizard', content: 'hallo' }] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns the assistant message on success', async () => {
    const fetchMock = stubFetch(
      vlamResponse({ model: 'mistral-medium', choices: [{ message: { content: 'Een AIIA is...' } }] }),
    )

    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ reply: 'Een AIIA is...', model: 'mistral-medium' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://vlam.example/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(init.body as string).model).toBe('test-model')
  })

  it('falls back to the configured model when VLAM names none', async () => {
    stubFetch(vlamResponse({ choices: [{ message: { content: 'ok' } }] }))
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.json().model).toBe('test-model')
  })

  it('maps an upstream error status to 502', async () => {
    stubFetch(vlamResponse({ error: 'nope' }, 500))
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(502)
    expect(res.json().detail).toContain('500')
  })

  it.each([
    ['an empty choices list', { choices: [] }],
    ['no choices at all', { model: 'x' }],
    ['a choice without a message', { choices: [{}] }],
    ['a message without content', { choices: [{ message: {} }] }],
  ])('maps %s to 502', async (_label, payload) => {
    stubFetch(vlamResponse(payload))
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(502)
  })

  it('maps a timeout to 504', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    stubFetch(timeout)
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(504)
  })

  it('maps an unreachable gateway to 502', async () => {
    stubFetch(new TypeError('fetch failed'))
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.statusCode).toBe(502)
  })

  it('never sends the key to the client, in any outcome', async () => {
    stubFetch(vlamResponse({ choices: [{ message: { content: 'ok' } }] }))
    const res = await app.inject({ method: 'POST', url: CHAT_URL, headers: headers(), payload: body })
    expect(res.body).not.toContain(KEY)
  })
})

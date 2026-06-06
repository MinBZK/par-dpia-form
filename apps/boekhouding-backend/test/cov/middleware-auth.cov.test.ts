// Self-sufficient coverage test for src/middleware/auth.ts (requireAuth).
//
// The middleware is exercised end-to-end through a real Fastify route that
// registers requireAuth as a preHandler (GET /api/v1/projects). Real RS256
// JWTs are signed by the loopback test JWKS server and verified by the
// unmodified middleware — no auth code path is mocked or bypassed.
//
// Every branch of requireAuth is covered:
//  - missing Authorization header / non-Bearer scheme (401)
//  - invalid signature / wrong issuer (jwtVerify throws -> catch -> 401)
//  - azp mismatch when an audience is configured (401)
//  - azp accepted when no audience is configured (config.audience falsy branch)
//  - missing sub or missing email claim (401)
//  - displayName precedence: name -> preferred_username -> email
//  - existing user: sync vs no-sync of email/displayName
//  - first login: insert new user
//  - first login with email already taken: onConflictDoUpdate on email
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { config } from '../../src/config.js'
import { db } from '../../src/db/connection.js'
import { users } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { TokenClaims } from '../helpers/testJwks.js'

let app: FastifyInstance
const jwks = getJwks()

function token(claims: Partial<TokenClaims> & { sub: string }) {
  return jwks.signToken({ email: `${claims.sub}@example.com`, ...claims })
}

function authHeader(t: string) {
  return { authorization: `Bearer ${t}` }
}

// GET /api/v1/projects requires auth and simply returns request.user's projects
// (an empty array for a freshly-created user), so a 200 proves the full
// requireAuth happy path ran and request.user was populated.
async function getProjects(headers?: Record<string, string>) {
  return app.inject({ method: 'GET', url: '/api/v1/projects', headers })
}

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await jwks.close()
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('requireAuth — Authorization header guard', () => {
  it('returns 401 problem+json when the Authorization header is absent', async () => {
    const res = await getProjects()
    expect(res.statusCode).toBe(401)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({
      status: 401,
      title: 'Niet geauthenticeerd',
      detail: 'Niet ingelogd',
    })
  })

  it('returns 401 when the scheme is not Bearer', async () => {
    const res = await getProjects({ authorization: 'Basic abc123' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Niet ingelogd' })
  })
})

describe('requireAuth — token verification', () => {
  it('returns 401 "Ongeldig token" when the issuer is wrong (jwtVerify throws)', async () => {
    const t = await token({ sub: randomUUID(), iss: 'https://evil.example.com/realms/x' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Ongeldig token' })
  })

  it('returns 401 "Ongeldig token" when the token is structurally invalid', async () => {
    const res = await getProjects(authHeader('not-a-real-jwt'))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Ongeldig token' })
  })

  it('returns 401 when azp does not match the configured audience', async () => {
    const t = await token({ sub: randomUUID(), azp: 'some-other-client' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Token is niet bedoeld voor deze applicatie' })
  })

  it('accepts any azp when no audience is configured (audience falsy branch)', async () => {
    const original = config.keycloak.audience
    // The signed token still carries azp = jwks.audience, but with no configured
    // audience the left operand of the azp check is falsy and the check is skipped.
    config.keycloak.audience = ''
    try {
      const t = await token({ sub: randomUUID() })
      const res = await getProjects(authHeader(t))
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    } finally {
      config.keycloak.audience = original
    }
  })
})

describe('requireAuth — required claims', () => {
  it('returns 401 when the token has no email claim', async () => {
    // signToken always sets sub; passing email '' yields no usable email claim.
    const t = await jwks.signToken({ sub: randomUUID(), email: '' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Ongeldig token' })
  })

  it('returns 401 when the token has no sub claim', async () => {
    // An empty sub is treated as missing by the !payload.sub guard.
    const t = await jwks.signToken({ sub: '', email: 'someone@example.com' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Ongeldig token' })
  })
})

describe('requireAuth — displayName precedence + user provisioning', () => {
  it('first login creates the user using the name claim as displayName', async () => {
    const sub = randomUUID()
    const t = await token({ sub, email: `${sub}@example.com`, name: 'Naam Uit Token' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.displayName).toBe('Naam Uit Token')
    expect(row.email).toBe(`${sub}@example.com`)
  })

  it('falls back to preferred_username when name is absent', async () => {
    const sub = randomUUID()
    const t = await token({ sub, email: `${sub}@example.com`, preferred_username: 'pref-user' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.displayName).toBe('pref-user')
  })

  it('falls back to email when neither name nor preferred_username is present', async () => {
    const sub = randomUUID()
    const t = await token({ sub, email: `${sub}@example.com` })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.displayName).toBe(`${sub}@example.com`)
  })

  it('existing user: no update when email and displayName are unchanged', async () => {
    const sub = randomUUID()
    const email = `${sub}@example.com`
    const t = await token({ sub, email, name: 'Stabiele Naam' })

    // First login provisions the user.
    expect((await getProjects(authHeader(t))).statusCode).toBe(200)
    const [before] = await db.select().from(users).where(eq(users.oidcSub, sub))

    // Second login with identical claims: the sync branch is false, no update.
    expect((await getProjects(authHeader(t))).statusCode).toBe(200)
    const [after] = await db.select().from(users).where(eq(users.oidcSub, sub))

    expect(after.id).toBe(before.id)
    expect(after.email).toBe(email)
    expect(after.displayName).toBe('Stabiele Naam')
  })

  it('existing user: syncs email and displayName when the token changed', async () => {
    const sub = randomUUID()
    const firstEmail = `${sub}-old@example.com`
    const secondEmail = `${sub}-new@example.com`

    // First login.
    expect((await getProjects(authHeader(await token({ sub, email: firstEmail, name: 'Oude Naam' })))).statusCode).toBe(200)

    // Second login with a changed email + name triggers the sync update.
    expect((await getProjects(authHeader(await token({ sub, email: secondEmail, name: 'Nieuwe Naam' })))).statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.email).toBe(secondEmail)
    expect(row.displayName).toBe('Nieuwe Naam')
  })

  it('first login with an email already taken updates the existing row by email (onConflictDoUpdate)', async () => {
    const sharedEmail = `shared-${randomUUID()}@example.com`
    // Pre-existing row with the email but a DIFFERENT oidc subject.
    const [existing] = await db
      .insert(users)
      .values({ email: sharedEmail, displayName: 'Origineel', oidcSub: `legacy-${randomUUID()}` })
      .returning()

    const newSub = randomUUID()
    const t = await token({ sub: newSub, email: sharedEmail, name: 'Gemigreerde Naam' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(200)

    // The conflicting row is reused (same id) and its oidcSub + displayName updated.
    const [row] = await db.select().from(users).where(eq(users.email, sharedEmail))
    expect(row.id).toBe(existing.id)
    expect(row.oidcSub).toBe(newSub)
    expect(row.displayName).toBe('Gemigreerde Naam')
  })
})

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { config } from '../../src/config.js'
import { db } from '../../src/db/connection.js'
import { users } from '../../src/db/schema.js'
import { userIdCache } from '../../src/utils/userIdCache.js'
import { warmUpJwks } from '../../src/middleware/auth.js'
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
    const t = await jwks.signToken({ sub: randomUUID(), email: '' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ detail: 'Ongeldig token' })
  })

  it('returns 401 when the token has no sub claim', async () => {
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

    expect((await getProjects(authHeader(t))).statusCode).toBe(200)
    const [before] = await db.select().from(users).where(eq(users.oidcSub, sub))

    // Clear the identity cache so the second request re-reads the existing user
    // from the DB (exercising the "found, unchanged" branch) rather than hitting
    // the cache and short-circuiting.
    userIdCache.clear()
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

    expect((await getProjects(authHeader(await token({ sub, email: firstEmail, name: 'Oude Naam' })))).statusCode).toBe(200)

    // A fresh (uncached) login must sync the changed claims; clear the cache to
    // simulate TTL expiry between the two logins.
    userIdCache.clear()
    expect((await getProjects(authHeader(await token({ sub, email: secondEmail, name: 'Nieuwe Naam' })))).statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.email).toBe(secondEmail)
    expect(row.displayName).toBe('Nieuwe Naam')
  })

  it('cache hit: a second request with the same sub skips the DB sync (changes lag until TTL)', async () => {
    const sub = randomUUID()
    const firstEmail = `${sub}-old@example.com`
    const secondEmail = `${sub}-new@example.com`

    // First login populates the cache.
    expect((await getProjects(authHeader(await token({ sub, email: firstEmail, name: 'Oude Naam' })))).statusCode).toBe(200)

    // Second login with changed claims but WITHOUT clearing the cache: the cache
    // hit serves the id and skips the users-lookup + sync, so the DB is unchanged.
    expect((await getProjects(authHeader(await token({ sub, email: secondEmail, name: 'Nieuwe Naam' })))).statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.email).toBe(firstEmail)
    expect(row.displayName).toBe('Oude Naam')
  })

  it('first login does NOT take over an email already claimed by another subject (409)', async () => {
    const sharedEmail = `shared-${randomUUID()}@example.com`
    const legacySub = `legacy-${randomUUID()}`
    const [existing] = await db
      .insert(users)
      .values({ email: sharedEmail, displayName: 'Origineel', oidcSub: legacySub })
      .returning()

    const newSub = randomUUID()
    const t = await token({ sub: newSub, email: sharedEmail, name: 'Gemigreerde Naam' })
    const res = await getProjects(authHeader(t))
    // Account linking must refuse: relinking a claimed row would be a takeover.
    expect(res.statusCode).toBe(409)

    const [row] = await db.select().from(users).where(eq(users.email, sharedEmail))
    expect(row.id).toBe(existing.id)
    expect(row.oidcSub).toBe(legacySub)
    expect(row.displayName).toBe('Origineel')
  })
})

describe('requireAuth — token type', () => {
  it('refuses an ID token', async () => {
    const t = await token({ sub: randomUUID(), typ: 'ID' })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toBe('Ongeldig tokentype')
  })
})

describe('requireAuth — email verification', () => {
  it('refuses a first login with an unverified email', async () => {
    const t = await token({ sub: randomUUID(), email_verified: false })
    const res = await getProjects(authHeader(t))
    expect(res.statusCode).toBe(403)
    expect(res.json().detail).toContain('niet geverifieerd')
  })

  it('does not create an account for an unverified email', async () => {
    const sub = randomUUID()
    const email = `unverified-${randomUUID()}@example.com`
    await getProjects(authHeader(await token({ sub, email, email_verified: false })))

    const rows = await db.select().from(users).where(eq(users.email, email))
    expect(rows).toHaveLength(0)
  })

  it('does not claim an invite placeholder with an unverified email', async () => {
    const email = `invited-${randomUUID()}@example.com`
    await db.insert(users).values({ email, displayName: email })

    const res = await getProjects(authHeader(await token({ sub: randomUUID(), email, email_verified: false })))
    expect(res.statusCode).toBe(403)

    const [row] = await db.select().from(users).where(eq(users.email, email))
    expect(row.oidcSub).toBeNull()
  })

  it('keeps the stored email when a returning user presents an unverified new address', async () => {
    const sub = randomUUID()
    const oldEmail = `old-${randomUUID()}@example.com`
    await getProjects(authHeader(await token({ sub, email: oldEmail, name: 'Naam' })))
    userIdCache.clear()

    const newEmail = `new-${randomUUID()}@example.com`
    const res = await getProjects(
      authHeader(await token({ sub, email: newEmail, name: 'Nieuwe Naam', email_verified: false })),
    )
    expect(res.statusCode).toBe(200)

    const [row] = await db.select().from(users).where(eq(users.oidcSub, sub))
    expect(row.email).toBe(oldEmail)
    // The name is not an identity binding, so it still syncs.
    expect(row.displayName).toBe('Nieuwe Naam')
  })
})

describe('warmUpJwks', () => {
  it('resolves when the warm-up succeeds', async () => {
    let called = false
    await warmUpJwks(async () => { called = true })
    expect(called).toBe(true)
  })

  it('swallows a failing warm-up', async () => {
    await expect(warmUpJwks(async () => { throw new Error('keycloak down') })).resolves.toBeUndefined()
  })

  // Without an injected warm function it reloads the real key set, which in this
  // suite is the loopback JWKS server.
  it('reloads the configured JWKS by default', async () => {
    await expect(warmUpJwks()).resolves.toBeUndefined()
  })
})

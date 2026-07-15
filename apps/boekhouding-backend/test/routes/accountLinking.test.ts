// Account-linking safety in requireAuth.
//
// A Keycloak login is matched to a local user by oidcSub. When no row exists for
// the subject yet, the middleware may CLAIM an invite placeholder (a row created
// by an invite, still without an oidcSub). It must NEVER relink a row that is
// already claimed by a different subject — that would be silent account takeover
// of another user's projects/data.
//
// These run the real Fastify app + requireAuth against a real Postgres test DB,
// with real JWTs signed by the loopback JWKS. No auth path is bypassed.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { users } from '../../src/db/schema.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser } from '../helpers/fixtures.js'

let app: FastifyInstance
const jwks = getJwks()

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

async function login(token: string) {
  return app.inject({ method: 'GET', url: '/api/v1/projects', headers: authHeader(token) })
}

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('requireAuth account linking', () => {
  it('does NOT relink an email already claimed by a different subject (no takeover)', async () => {
    const victim = await createUser({ email: 'victim@example.com' })

    // Attacker presents a valid token: different subject, same email.
    const token = await jwks.signToken({ sub: 'attacker-sub-999', email: 'victim@example.com' })
    const res = await login(token)

    expect(res.statusCode).toBe(409)

    // The victim's row must be untouched (still linked to the original subject).
    const [row] = await db.select().from(users).where(eq(users.email, 'victim@example.com'))
    expect(row.oidcSub).toBe(victim.oidcSub)
  })

  it('claims an unclaimed invite placeholder on first login', async () => {
    const [placeholder] = await db
      .insert(users)
      .values({ email: 'invitee@example.com', displayName: 'invitee@example.com' })
      .returning()
    expect(placeholder.oidcSub).toBeNull()

    const token = await jwks.signToken({ sub: 'new-sub-1', email: 'invitee@example.com', name: 'Invitee' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.id, placeholder.id))
    expect(row.oidcSub).toBe('new-sub-1')
  })

  it('creates a fresh account for a new subject + email', async () => {
    const token = await jwks.signToken({ sub: 'fresh-sub', email: 'fresh@example.com', name: 'Fresh' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.email, 'fresh@example.com'))
    expect(row?.oidcSub).toBe('fresh-sub')
  })

  it('handles concurrent first-logins for the same email without a 500 (one wins, one 409)', async () => {
    // Two different subjects log in simultaneously with the same email. The
    // unique(email) constraint + onConflictDoNothing guarantee exactly one
    // account is created (200) and the other is refused with 409 — never a 500.
    const tokenA = await jwks.signToken({ sub: 'race-a', email: 'race@example.com' })
    const tokenB = await jwks.signToken({ sub: 'race-b', email: 'race@example.com' })

    const [a, b] = await Promise.all([login(tokenA), login(tokenB)])

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    // Exactly one row exists, owned by whichever subject won the race.
    const rows = await db.select().from(users).where(eq(users.email, 'race@example.com'))
    expect(rows).toHaveLength(1)
    expect(['race-a', 'race-b']).toContain(rows[0].oidcSub)
  })

  it('still syncs email/name for an already-linked subject', async () => {
    const user = await createUser({ email: 'old@example.com', displayName: 'Old Name' })
    const token = await jwks.signToken({ sub: user.oidcSub, email: 'new@example.com', name: 'New Name' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.oidcSub, user.oidcSub))
    expect(row.email).toBe('new@example.com')
    expect(row.displayName).toBe('New Name')
  })

  it('syncs only the display name when the email is unchanged', async () => {
    const user = await createUser({ email: 'stable@example.com', displayName: 'Oude Naam' })
    const token = await jwks.signToken({ sub: user.oidcSub, email: 'stable@example.com', name: 'Nieuwe Naam' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.oidcSub, user.oidcSub))
    expect(row.email).toBe('stable@example.com')
    expect(row.displayName).toBe('Nieuwe Naam')
  })

  it('claims a lowercase invite placeholder when the JWT email uses different casing', async () => {
    // members.ts stores invites lowercase; a Keycloak account may present the
    // email attribute with different casing. requireAuth must still claim the
    // placeholder (normalising to lowercase) instead of creating a duplicate.
    const [placeholder] = await db
      .insert(users)
      .values({ email: 'jane.doe@voorbeeld.nl', displayName: 'jane.doe@voorbeeld.nl' })
      .returning()
    expect(placeholder.oidcSub).toBeNull()

    const token = await jwks.signToken({ sub: 'jane-sub', email: 'Jane.Doe@Voorbeeld.nl', name: 'Jane Doe' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    // The placeholder is claimed — not a second, orphaned account.
    const [row] = await db.select().from(users).where(eq(users.id, placeholder.id))
    expect(row.oidcSub).toBe('jane-sub')
    const all = await db.select().from(users).where(eq(users.email, 'jane.doe@voorbeeld.nl'))
    expect(all).toHaveLength(1)
  })

  it('keeps an existing user logged in (no 500/lockout) when their new email collides with another account', async () => {
    const a = await createUser({ email: 'a@example.com', displayName: 'A' })
    await createUser({ email: 'b@example.com', displayName: 'B' })

    // A's token now presents B's already-taken email — syncing it would violate
    // the unique(email) constraint. A must stay logged in, keeping the old email.
    const token = await jwks.signToken({ sub: a.oidcSub, email: 'b@example.com', name: 'A Hernoemd' })
    const res = await login(token)

    expect(res.statusCode).toBe(200)
    const [rowA] = await db.select().from(users).where(eq(users.oidcSub, a.oidcSub))
    expect(rowA.email).toBe('a@example.com')      // kept old email (collision avoided)
    expect(rowA.displayName).toBe('A Hernoemd')   // display name still synced
    const [rowB] = await db.select().from(users).where(eq(users.email, 'b@example.com'))
    expect(rowB.displayName).toBe('B')            // other account untouched
  })
})

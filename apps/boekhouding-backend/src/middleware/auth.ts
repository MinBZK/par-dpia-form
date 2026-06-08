import type { FastifyRequest, FastifyReply } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '../db/connection.js'
import { users } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { config } from '../config.js'
import { userIdCache } from '../utils/userIdCache.js'

export interface AuthUser {
  id: string
  email: string
  displayName: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

// Tighter timeout than the jose default (5000ms): fail fast on a cold/slow
// Keycloak so the first request is not blocked for 5 seconds. The cooldown
// matches the jose default so burst behaviour is unchanged.
const jwks = createRemoteJWKSet(new URL(config.keycloak.jwksUri), {
  timeoutDuration: 2500,
  cooldownDuration: 30000,
})

async function defaultWarm() {
  await jwks.reload()
}

/**
 * Pre-warm the JWKS cache so the first authenticated request does not pay the
 * cold-fetch cost. Best-effort: any error (Keycloak unreachable at startup) is
 * swallowed silently.
 *
 * The `warm` parameter is injectable for testing; production code uses the
 * default which calls `jwks.reload()`.
 */
export async function warmUpJwks(warm: () => Promise<void> = defaultWarm): Promise<void> {
  try {
    await warm()
  } catch {
    // Keycloak may not be reachable yet at worker start — that is expected.
    // The first real request will trigger a fresh fetch.
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/401',
      title: 'Niet geauthenticeerd',
      status: 401,
      detail: 'Niet ingelogd',
      instance: request.url,
    })
  }

  const token = authHeader.slice(7)

  let payload: { sub?: string; email?: string; name?: string; preferred_username?: string; azp?: string; exp?: number }
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: config.keycloak.issuer,
    })
    payload = result.payload as typeof payload

    // Keycloak sets the client ID in the `azp` (authorized party) claim, not `aud`.
    // Validate azp to prevent token confusion between Keycloak clients.
    if (config.keycloak.audience && payload.azp !== config.keycloak.audience) {
      return reply.status(401).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/401',
        title: 'Niet geauthenticeerd',
        status: 401,
        detail: 'Token is niet bedoeld voor deze applicatie',
        instance: request.url,
      })
    }
  } catch (err: any) {
    return reply.status(401).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/401',
      title: 'Niet geauthenticeerd',
      status: 401,
      detail: 'Ongeldig token',
      instance: request.url,
    })
  }

  if (!payload.sub || !payload.email) {
    return reply.status(401).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/401',
      title: 'Niet geauthenticeerd',
      status: 401,
      detail: 'Ongeldig token',
      instance: request.url,
    })
  }

  const displayName = payload.name || payload.preferred_username || payload.email

  // Identity cache: the token is already fully validated above (signature,
  // issuer, azp, exp), so a hit only skips the users-lookup — never validation.
  // Authorization is still checked live downstream, so a cache hit cannot leak
  // access. On a hit, email/displayName come from this request's token, so no
  // personal data is kept in the cache itself.
  const now = Date.now()
  const cachedId = userIdCache.get(payload.sub, now)
  if (cachedId !== undefined) {
    request.user = { id: cachedId, email: payload.email, displayName }
    return
  }

  // Find or create user by OIDC subject
  let [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.oidcSub, payload.sub))
    .limit(1)

  if (user) {
    // Sync email and name from Keycloak (e.g. after an email/name change). The
    // email is only synced when no other account already uses it: a collision
    // would violate the unique(email) constraint and lock this user out, so the
    // existing email is kept in that case (and logged). The name always syncs.
    if (user.email !== payload.email || user.displayName !== displayName) {
      let email = payload.email
      if (email !== user.email) {
        const [clash] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
        if (clash) {
          request.log.warn('Skipping email sync: address already linked to another account')
          email = user.email
        }
      }
      const [updated] = await db
        .update(users)
        .set({ email, displayName })
        .where(eq(users.oidcSub, payload.sub))
        .returning({ id: users.id, email: users.email, displayName: users.displayName })
      user = updated
    }
  } else {
    // First login for this subject.
    // Claim an invite placeholder — a row created by an invite that is still
    // without an oidcSub — but ONLY while it is unclaimed (guarded by the
    // isNull condition, which is atomic with the update). A row that is already
    // linked to another subject is NEVER overwritten, preventing account takeover.
    const [claimed] = await db
      .update(users)
      .set({ oidcSub: payload.sub, displayName })
      .where(and(eq(users.email, payload.email), isNull(users.oidcSub)))
      .returning({ id: users.id, email: users.email, displayName: users.displayName })

    if (claimed) {
      user = claimed
    } else {
      // No unclaimed placeholder. Insert a fresh account; if a row with this
      // email already exists — linked to a different subject, or created by a
      // concurrent first-login — DO NOTHING (never relink/overwrite) and refuse.
      // onConflictDoNothing makes this race-safe: exactly one concurrent insert
      // wins, the other gets no row back and falls through to 409 (not a 500).
      const [created] = await db
        .insert(users)
        .values({
          email: payload.email,
          displayName,
          oidcSub: payload.sub,
        })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id, email: users.email, displayName: users.displayName })

      if (created) {
        user = created
      } else {
        return reply.status(409).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/409',
          title: 'Conflict',
          status: 409,
          detail: 'Dit e-mailadres is al gekoppeld aan een ander account.',
          instance: request.url,
        })
      }
    }
  }

  // Cache the resolved id. The TTL is bounded and never outlives the token, so
  // a stale identity (or a removed user) can persist for at most the TTL.
  userIdCache.set(payload.sub, user.id, payload.exp, now)

  request.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  }
}

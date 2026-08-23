import type { FastifyRequest, FastifyReply } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '../db/connection.js'
import { users } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { config } from '../config.js'
import { userIdCache } from '../utils/userIdCache.js'

export interface AuthUser {
  // Only the internal id. email/displayName are intentionally NOT exposed on the
  // request: nothing consumes them (routes authorize on id), and keeping them off
  // the request avoids carrying personal data around (AVG) and the latent trap of
  // an attribute that differed between a cache hit (token) and miss (DB).
  id: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

// 2500ms, tighter than jose's 5000ms default, to fail fast on a cold Keycloak.
// Cooldown left at the jose default.
const jwks = createRemoteJWKSet(new URL(config.keycloak.jwksUri), {
  timeoutDuration: 2500,
  cooldownDuration: 30000,
})

async function defaultWarm() {
  await jwks.reload()
}

/**
 * Pre-fetch the JWKS so the first authenticated request does not pay the cold
 * fetch. Best-effort: Keycloak may not be up yet, and the first real request
 * fetches anyway.
 */
export async function warmUpJwks(warm: () => Promise<void> = defaultWarm): Promise<void> {
  try {
    await warm()
  } catch {
    // Expected when Keycloak lags behind the backend at startup.
  }
}

interface TokenPayload {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
  azp?: string
  typ?: string
  exp?: number
}

type VerifiedToken = TokenPayload & { sub: string; email: string }

export type BearerResult =
  | { ok: true; payload: VerifiedToken }
  | {
      ok: false
      detail:
        | 'Niet ingelogd'
        | 'Ongeldig token'
        | 'Ongeldig tokentype'
        | 'Token is niet bedoeld voor deze applicatie'
    }

// Verified payloads keyed by request object: the rate-limit keyGenerator runs on
// onRequest and requireAuth on preHandler, and both need the verified `sub`.
// Without this the signature check would run twice per request.
const verifiedTokens = new WeakMap<FastifyRequest, BearerResult>()

async function verifyToken(request: FastifyRequest): Promise<BearerResult> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, detail: 'Niet ingelogd' }

  let payload: TokenPayload
  try {
    // exp is required explicitly: jose only enforces expiry when the claim is
    // present, so a realm that omits it would hand out non-expiring tokens.
    const result = await jwtVerify(authHeader.slice(7), jwks, {
      issuer: config.keycloak.issuer,
      algorithms: ['RS256'],
      requiredClaims: ['exp'],
    })
    payload = result.payload as TokenPayload
  } catch {
    return { ok: false, detail: 'Ongeldig token' }
  }

  // Keycloak stamps access tokens with typ 'Bearer' and ID tokens with 'ID'. An
  // ID token carries the same issuer and azp, so without this check it would
  // pass here as an access token.
  if (payload.typ !== 'Bearer') {
    return { ok: false, detail: 'Ongeldig tokentype' }
  }

  // Keycloak sets the client ID in the `azp` (authorized party) claim, not `aud`.
  // Validate azp to prevent token confusion between Keycloak clients.
  if (config.keycloak.audience && payload.azp !== config.keycloak.audience) {
    return { ok: false, detail: 'Token is niet bedoeld voor deze applicatie' }
  }

  if (!payload.sub || !payload.email) return { ok: false, detail: 'Ongeldig token' }

  return { ok: true, payload: payload as VerifiedToken }
}

/**
 * Verify the bearer token (signature, issuer, azp, exp) without touching the
 * database, memoised per request. Used both by requireAuth and by the rate-limit
 * key generator; the latter must never trust an unverified `sub`, or an attacker
 * could mint an unlimited number of buckets.
 */
export async function verifyBearer(request: FastifyRequest): Promise<BearerResult> {
  const cached = verifiedTokens.get(request)
  if (cached) return cached

  const result = await verifyToken(request)
  verifiedTokens.set(request, result)
  return result
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const verified = await verifyBearer(request)
  if (!verified.ok) {
    return reply.status(401).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/401',
      title: 'Niet geauthenticeerd',
      status: 401,
      detail: verified.detail,
      instance: request.url,
    })
  }

  const payload = verified.payload

  // Normalise to lowercase so lookups/claims match invite placeholders, which
  // members.ts also stores lowercase. The users.email column is a plain,
  // case-sensitive text column, so a casing mismatch here would fail to claim
  // an invite and create a duplicate account.
  const normalizedEmail = payload.email.toLowerCase()

  const displayName = payload.name || payload.preferred_username || normalizedEmail

  // Invites bind by email address, so an unverified address must not bind to an
  // account: anyone who later registers it would inherit the memberships waiting
  // for it. Gates both binding paths below.
  const emailVerified = payload.email_verified === true

  // Identity cache: the token is already fully validated above (signature,
  // issuer, azp, exp), so a hit only skips the users-lookup - never validation.
  // Authorization is still checked live downstream, so a cache hit cannot leak
  // access. The cache stores nothing but the internal id.
  const now = Date.now()
  const cachedId = userIdCache.get(payload.sub, now)
  if (cachedId !== undefined) {
    request.user = { id: cachedId }
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
    const syncEmail = emailVerified && user.email !== normalizedEmail
    if (syncEmail || user.displayName !== displayName) {
      let email = user.email
      if (syncEmail) {
        const [clash] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1)
        if (clash) {
          request.log.warn('Skipping email sync: address already linked to another account')
        } else {
          email = normalizedEmail
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
    // First login for this subject: both branches below bind this email address
    // to this account, so an unverified address stops here.
    if (!emailVerified) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: 'Je e-mailadres is niet geverifieerd. Verifieer het bij je account en log opnieuw in.',
        instance: request.url,
      })
    }

    // Claim an invite placeholder — a row created by an invite that is still
    // without an oidcSub — but ONLY while it is unclaimed (guarded by the
    // isNull condition, which is atomic with the update). A row that is already
    // linked to another subject is NEVER overwritten, preventing account takeover.
    const [claimed] = await db
      .update(users)
      .set({ oidcSub: payload.sub, displayName })
      .where(and(eq(users.email, normalizedEmail), isNull(users.oidcSub)))
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
          email: normalizedEmail,
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

  request.user = { id: user.id }
}

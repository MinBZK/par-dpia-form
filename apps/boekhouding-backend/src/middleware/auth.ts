import type { FastifyRequest, FastifyReply } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '../db/connection.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { config } from '../config.js'

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

const jwks = createRemoteJWKSet(new URL(config.keycloak.jwksUri))

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

  let payload: { sub?: string; email?: string; name?: string; preferred_username?: string; azp?: string }
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

  // Find or create user by OIDC subject
  let [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.oidcSub, payload.sub))
    .limit(1)

  if (user) {
    // Sync email and name from Keycloak (e.g. after email change)
    if (user.email !== payload.email || user.displayName !== displayName) {
      const [updated] = await db
        .update(users)
        .set({ email: payload.email, displayName })
        .where(eq(users.oidcSub, payload.sub))
        .returning({ id: users.id, email: users.email, displayName: users.displayName })
      user = updated
    }
  } else {
    // First login — create user record
    const [created] = await db
      .insert(users)
      .values({
        email: payload.email,
        displayName,
        oidcSub: payload.sub,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { oidcSub: payload.sub, displayName },
      })
      .returning({ id: users.id, email: users.email, displayName: users.displayName })
    user = created
  }

  request.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  }
}

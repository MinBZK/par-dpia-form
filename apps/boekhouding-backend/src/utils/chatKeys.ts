import { SignJWT, jwtVerify } from 'jose'
import { config } from '../config.js'

/**
 * Chat keys let the command line (scripts/experiment) talk to the model without
 * a Keycloak token. A key is a JWT the backend signs with CHAT_KEY_SECRET
 * (HS256): it names the user, lives for CHAT_KEY_TTL_HOURS, and only the chat
 * routes accept it, so a key that leaks cannot read or change anyone's answers.
 * Keycloak tokens are RS256 and never pass for a key, nor a key for a login.
 */
const ISSUER = 'boekhouding-backend'
const AUDIENCE = 'chat'
const MIN_SECRET_LENGTH = 32

export function chatKeysEnabled(): boolean {
  return config.chat.keys.secret.length >= MIN_SECRET_LENGTH
}

const secret = () => new TextEncoder().encode(config.chat.keys.secret)

export async function issueChatKey(userId: string, now = Date.now()): Promise<{ key: string; expiresAt: string }> {
  const expiresAt = new Date(now + config.chat.keys.ttlHours * 3_600_000)
  const key = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret())
  return { key, expiresAt: expiresAt.toISOString() }
}

/** The user id a valid chat key names, or null for anything else. */
export async function verifyChatKey(token: string): Promise<string | null> {
  if (!chatKeysEnabled()) return null
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      requiredClaims: ['exp', 'sub'],
    })
    return payload.sub as string
  } catch {
    return null
  }
}

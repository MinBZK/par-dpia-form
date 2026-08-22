// Local JWKS + token signer for backend integration tests.
//
// The real requireAuth middleware runs unchanged; only the upstream identity
// provider is swapped for a loopback HTTP server. This way tests exercise the
// actual JWT signature + issuer + azp validation in jose — nothing is mocked
// away, and no code path exists that would let auth be bypassed in production.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose'
import type { KeyObject } from 'node:crypto'

export interface TestJwks {
  issuer: string
  audience: string
  realm: string
  jwksUri: string
  oidcUrl: string
  signToken: (claims: TokenClaims) => Promise<string>
  close: () => Promise<void>
}

export interface TokenClaims {
  sub: string
  email: string
  name?: string
  preferred_username?: string
  azp?: string
  iss?: string
  expiresIn?: string // e.g. '1h'
  /** Keycloak stamps 'Bearer' on access tokens and 'ID' on ID tokens. */
  typ?: string
  email_verified?: boolean
}

export async function startTestJwks(opts: { realm?: string; audience?: string } = {}): Promise<TestJwks> {
  const realm = opts.realm ?? 'test-realm'
  const audience = opts.audience ?? 'test-client'

  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const publicJwk: JWK = { ...(await exportJWK(publicKey as unknown as KeyObject)), alg: 'RS256', use: 'sig', kid: 'test-key-1' }

  const jwksPath = `/realms/${realm}/protocol/openid-connect/certs`

  const server: Server = createServer((req, res) => {
    if (req.url === jwksPath) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const oidcUrl = `http://127.0.0.1:${port}`
  const issuer = `${oidcUrl}/realms/${realm}`

  return {
    issuer,
    audience,
    realm,
    jwksUri: `${oidcUrl}${jwksPath}`,
    oidcUrl,
    signToken: async (claims) => {
      const jwt = new SignJWT({
        email: claims.email,
        name: claims.name,
        preferred_username: claims.preferred_username,
        azp: claims.azp ?? audience,
        // Defaults mirror a Keycloak access token, which the middleware requires.
        typ: claims.typ ?? 'Bearer',
        email_verified: claims.email_verified ?? true,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .setIssuedAt()
        .setIssuer(claims.iss ?? issuer)
        .setSubject(claims.sub)
        .setExpirationTime(claims.expiresIn ?? '1h')
      return jwt.sign(privateKey)
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    }),
  }
}

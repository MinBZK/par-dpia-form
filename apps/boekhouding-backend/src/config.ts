const oidcUrl = process.env.OIDC_URL || 'http://localhost:8080'
const oidcInternalUrl = process.env.OIDC_INTERNAL_URL || oidcUrl
const oidcRealm = process.env.OIDC_REALM || 'assessment-boekhouding'

// CORS_ORIGIN supports a single origin, or a comma-separated list for development
// environments where the app is reached via multiple hostnames (localhost, myserver, etc.)
function parseCorsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN || process.env.PUBLIC_HOST || 'http://localhost:5174'
  if (raw.includes(',')) {
    return raw.split(',').map(o => o.trim()).filter(Boolean)
  }
  return raw
}

const corsOrigin = parseCorsOrigin()

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  // API docs (/api/docs + /api/openapi.json): off in production unless EXPOSE_API_DOCS=true.
  exposeApiDocs: process.env.EXPOSE_API_DOCS === 'true' || process.env.NODE_ENV !== 'production',
  // Proxy CIDR/hop count so req.ip is the real client behind the ZAD ingress.
  // Never 'true' (X-Forwarded-For becomes spoofable). Unset for direct/local access.
  trustProxy: process.env.TRUST_PROXY,
  databaseUrl: process.env.DATABASE_SERVER_FULL || 'postgresql://parassessment:parassessment@localhost:5432/parassessment',
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
  // Public-facing base URL of this deployment. ZAD injects PUBLIC_HOST per
  // deployment (including per review branch), so this stays correct everywhere
  // instead of hardcoding one environment. Used for OpenAPI metadata.
  publicUrl: Array.isArray(corsOrigin) ? corsOrigin[0] : corsOrigin,
  keycloak: {
    issuer: `${oidcUrl}/realms/${oidcRealm}`,
    jwksUri: `${oidcInternalUrl}/realms/${oidcRealm}/protocol/openid-connect/certs`,
    audience: process.env.OIDC_PUBLIC_CLIENT_ID || 'boekhouding-frontend',
  },
}

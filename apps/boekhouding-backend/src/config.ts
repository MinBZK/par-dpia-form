const oidcUrl = process.env.OIDC_URL || 'http://localhost:8080'
const oidcInternalUrl = process.env.OIDC_INTERNAL_URL || oidcUrl
const oidcRealm = process.env.OIDC_REALM || 'assessment-boekhouding'

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_SERVER_FULL || 'postgresql://parassessment:parassessment@localhost:5432/parassessment',
  cors: {
    origin: process.env.CORS_ORIGIN || process.env.PUBLIC_HOST || 'http://localhost:5174',
    credentials: true,
  },
  keycloak: {
    issuer: `${oidcUrl}/realms/${oidcRealm}`,
    jwksUri: `${oidcInternalUrl}/realms/${oidcRealm}/protocol/openid-connect/certs`,
    audience: process.env.OIDC_PUBLIC_CLIENT_ID || 'boekhouding-frontend',
  },
}

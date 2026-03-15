export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://parassessment:parassessment@localhost:5432/parassessment',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    credentials: true,
  },
  keycloak: {
    issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/realms/assessment-boekhouding',
    jwksUri: process.env.KEYCLOAK_JWKS_URI || 'http://localhost:8080/realms/assessment-boekhouding/protocol/openid-connect/certs',
    audience: process.env.KEYCLOAK_AUDIENCE || 'boekhouding-frontend',
  },
}

const oidcUrl = process.env.OIDC_URL || 'http://localhost:8080'
const oidcInternalUrl = process.env.OIDC_INTERNAL_URL || oidcUrl
const oidcRealm = process.env.OIDC_REALM || 'invulhulpen'

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

function parseTrustProxy(): number | string {
  const v = process.env.TRUST_PROXY
  if (!v) return 1
  return /^\d+$/.test(v) ? Number(v) : v
}

// Parse a positive-integer env var, clamped to [1, max]. Falls back to the
// default when unset, non-numeric, or below 1 - so a misconfigured value can
// never produce an unsafe state (e.g. a pool of 0 or an absurdly large value).
function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

// Same, but 0 is a valid value (used by the shutdown delay, where 0 means
// "close immediately" - useful locally, never in Kubernetes).
function parseNonNegativeInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(n, max)
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  exposeApiDocs: process.env.EXPOSE_API_DOCS === 'true',
  trustProxy: parseTrustProxy(),
  databaseUrl: process.env.DATABASE_SERVER_FULL || 'postgresql://parassessment:parassessment@localhost:5432/parassessment',
  // Postgres connection pool. The RIG shared Postgres caps each project DB user
  // at 20 connections total (see README), and a rolling deploy briefly runs two
  // pods (old + surge), so the budget is:
  //   pods × DB_POOL_MAX  ≤  20.
  // Default 9 → 2 pods × 9 = 18, a tight margin under 20. Raise the pool or the
  // replica count only within that budget, or put a connection pooler
  // (PgBouncer) in front.
  // statementTimeout/idleInTransactionTimeout are in SECONDS (like the timeouts
  // above) and converted to ms at the postgres-js boundary. They make a query
  // fail fast instead of holding a pooled connection indefinitely - without a
  // statement timeout, one stuck query under pool exhaustion blocks the pool
  // with no backpressure (availability risk under the 20-connection cap).
  db: {
    max: parsePositiveInt(process.env.DB_POOL_MAX, 9, 20),
    connectTimeout: parsePositiveInt(process.env.DB_CONNECT_TIMEOUT, 10, 300),
    idleTimeout: parsePositiveInt(process.env.DB_IDLE_TIMEOUT, 30, 86400),
    statementTimeout: parsePositiveInt(process.env.DB_STATEMENT_TIMEOUT, 15, 300),
    idleInTransactionTimeout: parsePositiveInt(process.env.DB_IDLE_IN_TX_TIMEOUT, 15, 300),
  },
  // Request limits per minute. A request whose bearer token verifies is bucketed
  // per user (userMax); everything else - health probes, docs, expired or invalid
  // tokens - falls back to a per-IP bucket (max), so colleagues behind one office
  // NAT no longer share one budget. Logins never reach this service (the frontend
  // talks to Keycloak directly), so the IP bucket only sees health probes and
  // requests carrying a bad or expired token - hence the tight 100. One symptom to
  // recognise: during a Keycloak outage a whole office behind one NAT can drain
  // that bucket with expired tokens and get 429s where 401s belong.
  // userMax is set well above any legitimate usage pattern because a 429 currently
  // fails silently in the polling and autosave paths.
  rateLimit: {
    max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 100, 100000),
    userMax: parsePositiveInt(process.env.RATE_LIMIT_USER_MAX, 1000, 100000),
  },
  // Seconds to keep serving after SIGTERM before closing the server, so a
  // Kubernetes rolling deploy has time to withdraw this pod from the service
  // endpoints while the readiness probe already reports 503. Must stay well
  // under terminationGracePeriodSeconds (30s by default).
  shutdownDelay: parseNonNegativeInt(process.env.SHUTDOWN_DELAY, 5, 60),
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

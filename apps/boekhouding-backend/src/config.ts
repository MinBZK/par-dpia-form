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
// default when unset, non-numeric, or below 1 — so a misconfigured value can
// never produce an unsafe state (e.g. a pool of 0 or an absurdly large value).
function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, max)
}

// Worker-process count for clustering. Returns null when unset/invalid so the
// entry point can default to one worker per CPU core; an explicit value is
// clamped to [1, 64] (1 effectively disables clustering). The clamp prevents a
// misconfigured value from fork-bombing the host.
function parseWebConcurrency(): number | null {
  const v = process.env.WEB_CONCURRENCY
  if (!v) return null
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, 64)
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  webConcurrency: parseWebConcurrency(),
  exposeApiDocs: process.env.EXPOSE_API_DOCS === 'true',
  trustProxy: parseTrustProxy(),
  databaseUrl: process.env.DATABASE_SERVER_FULL || 'postgresql://parassessment:parassessment@localhost:5432/parassessment',
  // Postgres connection pool, PER worker process. The RIG shared Postgres caps
  // each project DB user at 20 connections total (see README), and a rolling
  // deploy briefly runs two pods (old + surge), so the budget is:
  //   pods × WEB_CONCURRENCY × DB_POOL_MAX  ≤  20.
  // Default 9 → 2 pods × 1 worker × 9 = 18, a tight margin under 20. The app is
  // I/O-bound so one worker with this pool is plenty; the ceiling is the cap.
  // Raise the pool / add workers/replicas only within that budget, or put a
  // connection pooler (PgBouncer) in front.
  db: {
    max: parsePositiveInt(process.env.DB_POOL_MAX, 9, 20),
    connectTimeout: parsePositiveInt(process.env.DB_CONNECT_TIMEOUT, 10, 300),
    idleTimeout: parsePositiveInt(process.env.DB_IDLE_TIMEOUT, 30, 86400),
  },
  // Global request limit per IP per minute. Under clustering the in-memory store
  // is per worker, so the entry point divides this across workers to keep the
  // cluster-wide limit close to `max`.
  rateLimit: {
    max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 300, 100000),
  },
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

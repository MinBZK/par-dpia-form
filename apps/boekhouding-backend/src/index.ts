import cluster from 'node:cluster'
import { buildApp } from './app.js'
import { config } from './config.js'
import { warmUpJwks } from './middleware/auth.js'

// Single worker by default. The app is I/O-bound (low CPU), and the shared
// Postgres caps this DB user at 20 connections total, so each extra worker
// multiplies connection pressure (workers × DB_POOL_MAX). Opt into clustering
// by setting WEB_CONCURRENCY > 1, and then lower DB_POOL_MAX so that
// WEB_CONCURRENCY × DB_POOL_MAX stays within the budget (see README/config.ts).
const workers = config.webConcurrency ?? 1

if (workers > 1 && cluster.isPrimary) {
  // Migrations already ran once before this process started (the container CMD
  // runs `migrate && index`), so the primary only supervises workers.
  for (let i = 0; i < workers; i++) cluster.fork()
  cluster.on('exit', (worker, code, signal) => {
    console.error(`worker ${worker.process.pid} exited (${signal || code}); starting a replacement`)
    cluster.fork()
  })
} else {
  // Each worker keeps its own in-memory rate-limit store, so divide the global
  // limit across workers to keep the cluster-wide limit close to the configured value.
  const rateLimitMax = Math.max(1, Math.ceil(config.rateLimit.max / workers))
  const app = await buildApp({ rateLimitMax })

  // Best-effort: prime the JWKS cache so the first authenticated request doesn't
  // pay the cold Keycloak fetch. Failure here is swallowed (warmUpJwks is best-effort).
  await warmUpJwks()

  try {
    await app.listen({ port: config.port, host: config.host })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

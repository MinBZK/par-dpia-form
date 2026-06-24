import cluster from 'node:cluster'
import { buildApp } from './app.js'
import { config } from './config.js'
import { queryClient } from './db/connection.js'
import { poolBudgetWarning } from './utils/poolBudget.js'

// Single worker by default. The app is I/O-bound (low CPU), and the shared
// Postgres caps this DB user at 20 connections total, so each extra worker
// multiplies connection pressure (workers × DB_POOL_MAX). Opt into clustering
// by setting WEB_CONCURRENCY > 1, and then lower DB_POOL_MAX so that
// WEB_CONCURRENCY × DB_POOL_MAX stays within the budget (see README/config.ts).
const workers = config.webConcurrency ?? 1

// Surface a misconfigured connection budget loudly at startup (primary/single
// process only) instead of letting the pool silently exhaust the per-user cap.
const budgetWarning = poolBudgetWarning(config.webConcurrency, config.db.max)
if (budgetWarning && cluster.isPrimary) console.warn(budgetWarning)

if (workers > 1 && cluster.isPrimary) {
  let shuttingDown = false
  // Migrations already ran once before this process started (the container CMD
  // runs `migrate && index`), so the primary only supervises workers.
  for (let i = 0; i < workers; i++) cluster.fork()
  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) {
      // During a planned shutdown, exit once the last worker is gone instead of
      // replacing it (a clean exit must not trigger a re-fork).
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0)
      return
    }
    console.error(`worker ${worker.process.pid} exited (${signal || code}); starting a replacement`)
    cluster.fork()
  })
  // On a rolling deploy/scale-down k8s sends SIGTERM. Stop replacing workers and
  // ask each to close gracefully so in-flight requests drain and the DB pool is
  // released, instead of the default disposition killing them abruptly.
  const shutdownPrimary = () => {
    shuttingDown = true
    for (const worker of Object.values(cluster.workers ?? {})) worker?.kill('SIGTERM')
  }
  process.on('SIGTERM', shutdownPrimary)
  process.on('SIGINT', shutdownPrimary)
} else {
  // Each worker keeps its own in-memory rate-limit store, so divide the global
  // limit across workers to keep the cluster-wide limit close to the configured value.
  const rateLimitMax = Math.max(1, Math.ceil(config.rateLimit.max / workers))
  const app = await buildApp({ rateLimitMax })

  // Graceful shutdown: drain in-flight requests (app.close) then release the DB
  // pool (queryClient.end) so a rolling deploy/scale-down doesn't cut requests or
  // leave connections lingering until idle_timeout under the shared 20-conn cap.
  const shutdown = async () => {
    try {
      await app.close()
      await queryClient.end({ timeout: 5 })
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  try {
    await app.listen({ port: config.port, host: config.host })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

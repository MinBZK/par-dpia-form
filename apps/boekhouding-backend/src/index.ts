import cluster from 'node:cluster'
import { availableParallelism } from 'node:os'
import { buildApp } from './app.js'
import { config } from './config.js'

// One worker per CPU core by default, so we actually use the available CPU.
// WEB_CONCURRENCY pins the count (1 disables clustering; lower it when scaling
// horizontally via replicas instead). The value is clamped in config.ts.
const workers = config.webConcurrency ?? availableParallelism()

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

  try {
    await app.listen({ port: config.port, host: config.host })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

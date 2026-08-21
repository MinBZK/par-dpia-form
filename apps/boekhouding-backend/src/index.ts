import { setTimeout as delay } from 'node:timers/promises'
import { buildApp } from './app.js'
import { config } from './config.js'
import { queryClient } from './db/connection.js'

const app = await buildApp()

// Graceful shutdown for a Kubernetes rolling deploy. The kubelet sends SIGTERM
// at the same moment the endpoint controller starts withdrawing this pod, and
// those propagate independently - so closing the server right away would refuse
// requests the ingress is still routing here. Instead: fail the readiness probe
// first, wait for the withdrawal to land, and only then drain in-flight requests
// and release the DB pool (which matters under the shared per-user connection
// cap). The whole sequence must fit in terminationGracePeriodSeconds.
let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  app.beginShutdown()
  try {
    await delay(config.shutdownDelay * 1000)
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

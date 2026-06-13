import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

// Exported so the entry point can drain the pool on graceful shutdown. The
// statement/idle-in-transaction timeouts (seconds in config → ms here) make a
// stuck query fail fast instead of holding a pooled connection indefinitely.
export const queryClient = postgres(config.databaseUrl, {
  max: config.db.max,
  connect_timeout: config.db.connectTimeout,
  idle_timeout: config.db.idleTimeout,
  connection: {
    statement_timeout: config.db.statementTimeout * 1000,
    idle_in_transaction_session_timeout: config.db.idleInTransactionTimeout * 1000,
  },
})

export const db = drizzle(queryClient, { schema })

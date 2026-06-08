import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

const queryClient = postgres(config.databaseUrl, {
  max: config.db.max,
  connect_timeout: config.db.connectTimeout,
  idle_timeout: config.db.idleTimeout,
})

export const db = drizzle(queryClient, { schema })

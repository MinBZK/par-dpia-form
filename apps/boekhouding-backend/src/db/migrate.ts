import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { config } from '../config.js'

const migrationClient = postgres(config.databaseUrl, { max: 1 })
const db = drizzle(migrationClient)

await migrate(db, { migrationsFolder: './drizzle' })
await migrationClient.end()

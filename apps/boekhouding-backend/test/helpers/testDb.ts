// Test database utilities: run migrations and truncate tables between tests.
//
// Relies on TEST_DATABASE_URL (or DATABASE_SERVER_FULL) being set before any
// src/* module is imported — setup.ts handles that.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 })
  try {
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}

// Order matters: truncate children before parents would be needed for FKs,
// but CASCADE handles that. Single TRUNCATE with CASCADE is fastest.
const TABLES = [
  'comments',
  'assessment_edits',
  'assessment_versions',
  'assessment_instances',
  'project_members',
  'projects',
  'users',
] as const

export async function truncateAll(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 })
  try {
    await client.unsafe(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
  } finally {
    await client.end()
  }
}

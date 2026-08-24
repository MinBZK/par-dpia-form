import { drizzle } from 'drizzle-orm/postgres-js'
import { eq, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { config } from '../src/config.js'
import { users, projects, projectMembers, assessmentInstances, assessmentVersions } from '../src/db/schema.js'

// Dev-only: seeds one assessment with many versions so the version-history
// "load more" pagination can be exercised. Run `pnpm db:seed` first (needs the test users).

const TARGET_VERSIONS = 1032
const PROJECT_NAME = 'Paginatie-test versiegeschiedenis'
const DPIA_URN = 'urn:nl:dpia:3.0'
const OUTPUT_SCHEMA = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

const queryClient = postgres(config.databaseUrl)
const db = drizzle(queryClient)

const target = new URL(config.databaseUrl)
console.log(`Target DB: ${target.host}${target.pathname}`)

const [sam] = await db.select().from(users).where(eq(users.email, 'sam@example.com'))
const [noor] = await db.select().from(users).where(eq(users.email, 'noor@example.com'))
if (!sam || !noor) {
  console.error('Test users not found. Run `pnpm db:seed` against this database first.')
  await queryClient.end()
  process.exit(1)
}

// Idempotent: remove any earlier run of this helper (cascade drops assessments + versions).
const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, PROJECT_NAME))
if (existing.length > 0) {
  await db.delete(projects).where(inArray(projects.id, existing.map((p) => p.id)))
  console.log(`Removed ${existing.length} earlier "${PROJECT_NAME}" project(s)`)
}

const now = new Date().toISOString()
const [project] = await db.insert(projects).values({
  name: PROJECT_NAME,
  description: `Testproject met een assessment van ${TARGET_VERSIONS} versies om de paginatie van de versiegeschiedenis te testen.`,
  createdBy: sam.id,
}).returning()

await db.insert(projectMembers).values([
  { projectId: project.id, userId: sam.id, role: 'owner', acceptedAt: new Date() },
  { projectId: project.id, userId: noor.id, role: 'editor', acceptedAt: new Date() },
])

const cachedState = {
  $schema: OUTPUT_SCHEMA,
  metadata: { createdAt: now, urn: DPIA_URN, completedTasks: [] },
  answers: {
    '0': { value: 'Testassessment voor de paginatie van de versiegeschiedenis.', lastEditedAt: now, lastEditedBy: sam.email },
  },
}

const [instance] = await db.insert(assessmentInstances).values({
  projectId: project.id,
  assessmentType: 'dpia',
  name: `Paginatie-test (${TARGET_VERSIONS} versies)`,
  createdBy: sam.id,
  currentVersion: TARGET_VERSIONS,
  cachedState,
}).returning()

// Spread timestamps one hour apart so version 1 is the oldest and ordering is stable.
const base = Date.now()
const hourMs = 60 * 60 * 1000
const versionRows = Array.from({ length: TARGET_VERSIONS }, (_, i) => {
  const version = i + 1
  const author = version % 2 === 0 ? noor : sam
  return {
    assessmentInstanceId: instance.id,
    version,
    createdBy: author.id,
    changeDescription: `Testversie ${version} van ${TARGET_VERSIONS}`,
    createdAt: new Date(base - (TARGET_VERSIONS - version) * hourMs),
    updatedAt: new Date(base - (TARGET_VERSIONS - version) * hourMs),
  }
})
await db.insert(assessmentVersions).values(versionRows)

console.log(`Created assessment ${instance.id} with ${TARGET_VERSIONS} versions`)
console.log(`Login as sam@example.com and open project "${PROJECT_NAME}" > version history.`)

await queryClient.end()

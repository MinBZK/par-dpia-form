// Small helpers for seeding users, projects, memberships and assessments.
// Uses the same db connection as the app, so tests operate on the same DB
// connection pool the routes use.
import { db } from '../../src/db/connection.js'
import {
  users,
  projects,
  projectMembers,
  assessmentInstances,
} from '../../src/db/schema.js'
import type { ProjectRole } from '../../src/middleware/projectAccess.js'
import { randomUUID } from 'node:crypto'

export interface SeededUser {
  id: string
  email: string
  displayName: string
  oidcSub: string
}

export async function createUser(overrides: Partial<SeededUser> = {}): Promise<SeededUser> {
  const token = randomUUID().slice(0, 8)
  const values = {
    email: overrides.email ?? `test-${token}@example.com`,
    displayName: overrides.displayName ?? `Test User ${token}`,
    oidcSub: overrides.oidcSub ?? `test-sub-${token}`,
  }
  const [row] = await db.insert(users).values(values).returning()
  return { id: row.id, email: row.email, displayName: row.displayName, oidcSub: row.oidcSub! }
}

export async function createProject(createdBy: string, name = 'Test project') {
  const [row] = await db.insert(projects).values({ name, createdBy }).returning()
  return row
}

export async function addMember(projectId: string, userId: string, role: ProjectRole) {
  await db.insert(projectMembers).values({ projectId, userId, role, acceptedAt: new Date() })
}

export async function createAssessment(
  projectId: string,
  createdBy: string,
  overrides: { name?: string; assessmentType?: 'dpia' | 'prescan'; cachedState?: unknown } = {},
) {
  const [row] = await db.insert(assessmentInstances).values({
    projectId,
    createdBy,
    name: overrides.name ?? 'Test assessment',
    assessmentType: overrides.assessmentType ?? 'dpia',
    cachedState: overrides.cachedState ?? {},
  }).returning()
  return row
}

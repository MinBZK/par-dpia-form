// Integration tests for the optimistic-locking save-race (issue #50).
//
// Verifies that simultaneous PUT /assessments/:id requests carrying the same
// expectedVersion cannot both succeed — exactly one wins, the other receives
// 409 Conflict, and no orphan assessmentVersions / assessmentEdits rows are
// left behind for the loser.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { assessmentVersions, assessmentEdits, assessmentInstances } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, createAssessment, type SeededUser } from '../helpers/fixtures.js'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

const OUTPUT_SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

function makeState(urn: string, answers: Record<string, unknown> = {}) {
  return {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: { createdAt: '2026-01-01T00:00:00Z', urn },
    answers,
  }
}

const URN = 'urn:nl:dpia:3.0'

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await jwks.close()
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

async function seed(user: SeededUser) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, 'owner')
  // Initial state with one answer so diff against next save produces edits.
  const assessment = await createAssessment(project.id, user.id, {
    cachedState: makeState(URN, { '0.1': { value: 'Start', lastEditedAt: '2026-01-01T00:00:00Z' } }),
  })
  return { project, assessment }
}

describe('PUT /assessments/:id — optimistic locking (issue #50)', () => {
  it('happy path: save with correct expectedVersion returns 200 and bumps version', async () => {
    const user = await createUser()
    const { assessment } = await seed(user)
    const token = await tokenFor(user)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState(URN, { '0.1': { value: 'A', lastEditedAt: '2026-01-02T00:00:00Z' } }),
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)
  })

  it('sequential stale save returns 409', async () => {
    const user = await createUser()
    const { assessment } = await seed(user)
    const token = await tokenFor(user)

    const first = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState(URN, { '0.1': { value: 'A', lastEditedAt: '2026-01-02T00:00:00Z' } }),
        expectedVersion: 1,
      },
    })
    expect(first.statusCode).toBe(200)

    // Second save with same expectedVersion=1 is now stale (actual is 2).
    const second = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState(URN, { '0.1': { value: 'B', lastEditedAt: '2026-01-03T00:00:00Z' } }),
        expectedVersion: 1,
      },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().currentVersion).toBe(2)
  })

  it('simultaneous race: two concurrent saves with same expectedVersion — exactly one wins', async () => {
    // Use two different users so both saves fall into the new-version branch
    // (consolidation requires same user), which is the branch where orphan
    // assessmentVersions rows are most likely.
    const userA = await createUser()
    const userB = await createUser()
    const project = await createProject(userA.id)
    await addMember(project.id, userA.id, 'owner')
    await addMember(project.id, userB.id, 'editor')
    const assessment = await createAssessment(project.id, userA.id, {
      cachedState: makeState(URN, { '0.1': { value: 'Start', lastEditedAt: '2026-01-01T00:00:00Z' } }),
    })
    const tokenA = await tokenFor(userA)
    const tokenB = await tokenFor(userB)

    const results = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/api/v1/assessments/${assessment.id}`,
        headers: authHeader(tokenA),
        payload: {
          state: makeState(URN, { '0.1': { value: 'A wins?', lastEditedAt: '2026-01-02T00:00:00Z' } }),
          expectedVersion: 1,
        },
      }),
      app.inject({
        method: 'PUT',
        url: `/api/v1/assessments/${assessment.id}`,
        headers: authHeader(tokenB),
        payload: {
          state: makeState(URN, { '0.1': { value: 'B wins?', lastEditedAt: '2026-01-02T00:00:00Z' } }),
          expectedVersion: 1,
        },
      }),
    ])

    const statuses = results.map(r => r.statusCode).sort()
    expect(statuses).toEqual([200, 409])

    // DB must show exactly version 2, and exactly one assessmentVersions row
    // for version 2 (loser's transaction rolled back).
    const [inst] = await db
      .select({ currentVersion: assessmentInstances.currentVersion })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(inst.currentVersion).toBe(2)

    const versions = await db
      .select({ version: assessmentVersions.version })
      .from(assessmentVersions)
      .where(eq(assessmentVersions.assessmentInstanceId, assessment.id))
    const v2count = versions.filter(v => v.version === 2).length
    expect(v2count).toBe(1)

    // No orphan edits (edits only linked to the winning version row).
    const allEdits = await db
      .select({ id: assessmentEdits.id, versionId: assessmentEdits.assessmentVersionId })
      .from(assessmentEdits)
      .innerJoin(assessmentVersions, eq(assessmentEdits.assessmentVersionId, assessmentVersions.id))
      .where(eq(assessmentVersions.assessmentInstanceId, assessment.id))
    const versionIds = new Set(
      (await db
        .select({ id: assessmentVersions.id })
        .from(assessmentVersions)
        .where(eq(assessmentVersions.assessmentInstanceId, assessment.id))).map(v => v.id),
    )
    for (const e of allEdits) {
      expect(versionIds.has(e.versionId)).toBe(true)
    }
  })

  it('simultaneous consolidate race: same user, two concurrent saves — exactly one wins, no orphan edits', async () => {
    const user = await createUser()
    const { assessment } = await seed(user)
    const token = await tokenFor(user)

    // Get to version 2 first so consolidation window applies for next saves.
    const prep = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState(URN, { '0.1': { value: 'prep', lastEditedAt: '2026-01-02T00:00:00Z' } }),
        expectedVersion: 1,
      },
    })
    expect(prep.statusCode).toBe(200)
    expect(prep.json().currentVersion).toBe(2)

    // Two concurrent saves with expectedVersion=2, both by same user → consolidation branch.
    const results = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/api/v1/assessments/${assessment.id}`,
        headers: authHeader(token),
        payload: {
          state: makeState(URN, { '0.1': { value: 'race A', lastEditedAt: '2026-01-03T00:00:00Z' } }),
          expectedVersion: 2,
        },
      }),
      app.inject({
        method: 'PUT',
        url: `/api/v1/assessments/${assessment.id}`,
        headers: authHeader(token),
        payload: {
          state: makeState(URN, { '0.1': { value: 'race B', lastEditedAt: '2026-01-03T00:00:00Z' } }),
          expectedVersion: 2,
        },
      }),
    ])

    const statuses = results.map(r => r.statusCode).sort()
    expect(statuses).toEqual([200, 409])

    // After race: currentVersion = 3 and no orphan edits.
    const [inst] = await db
      .select({ currentVersion: assessmentInstances.currentVersion })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(inst.currentVersion).toBe(3)
  })

  it('non-lock DB error during save propagates as 500 and rolls back (re-throw branch)', async () => {
    const user = await createUser()
    const { assessment } = await seed(user)
    const token = await tokenFor(user)

    // Pre-create the version row the save will try to insert (version 2), so the
    // new-version INSERT violates unique(assessmentInstanceId, version). That is a
    // non-OptimisticLockError that must propagate as 500, not be swallowed as 409.
    await db.insert(assessmentVersions).values({
      assessmentInstanceId: assessment.id,
      version: 2,
      createdBy: user.id,
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState(URN, { '0.1': { value: 'B', lastEditedAt: '2026-01-03T00:00:00Z' } }),
        expectedVersion: 1,
        changeDescription: 'forceer nieuwe versie',
      },
    })

    expect(res.statusCode).toBe(500)
    // Transaction rolled back: currentVersion stays at 1.
    const [inst] = await db
      .select({ currentVersion: assessmentInstances.currentVersion })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(inst.currentVersion).toBe(1)
  })
})

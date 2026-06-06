// Integration coverage for the sync route (GET /assessments/:id/sync).
//
// Runs the real Fastify app via app.inject() against the Postgres test DB.
// Auth is exercised end-to-end with real JWTs signed by the test keypair, so
// the requireAuth preHandler is genuinely executed (it sets request.user).
//
// This single file covers every branch of src/routes/sync.ts:
//  - !row            -> 404 (assessment does not exist)
//  - !row.memberRole -> 403 (assessment exists but user not a member)
//  - happy path with lastModifiedBySelf === true  (version row authored by self)
//  - happy path with lastModifiedBySelf === false (no version row -> null author,
//    and version row authored by someone else)
//  - commentCount === 0 and commentCount > 0
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { assessmentInstances, assessmentVersions, comments } from '../../src/db/schema.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import {
  createUser,
  createProject,
  addMember,
  createAssessment,
  type SeededUser,
} from '../helpers/fixtures.js'
import type { ProjectRole } from '../../src/middleware/projectAccess.js'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

// Seeds a project with `user` in the given role plus an assessment in it.
async function seedAssessmentFor(user: SeededUser, role: ProjectRole) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  const assessment = await createAssessment(project.id, user.id)
  return { project, assessment }
}

// Inserts an assessment_versions row at the given version, authored by `author`.
async function addVersion(assessmentId: string, version: number, author: SeededUser) {
  await db.insert(assessmentVersions).values({
    assessmentInstanceId: assessmentId,
    version,
    createdBy: author.id,
  })
}

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

describe('GET /assessments/:id/sync — auth preHandler', () => {
  it('returns 401 without Authorization header (requireAuth rejects before handler)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/sync`,
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /assessments/:id/sync — !row branch (404)', () => {
  it('returns problem+json 404 when the assessment does not exist', async () => {
    const user = await createUser()
    const token = await tokenFor(user)
    const url = `/api/v1/assessments/${randomUUID()}/sync`

    const res = await app.inject({ method: 'GET', url, headers: authHeader(token) })

    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({
      type: 'https://httpproblems.com/http-status/404',
      title: 'Niet gevonden',
      status: 404,
      detail: 'Assessment niet gevonden',
      instance: url,
    })
  })
})

describe('GET /assessments/:id/sync — !row.memberRole branch (403)', () => {
  it('returns problem+json 403 when the assessment exists but the user is not a member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const token = await tokenFor(outsider)
    const url = `/api/v1/assessments/${assessment.id}/sync`
    const res = await app.inject({ method: 'GET', url, headers: authHeader(token) })

    expect(res.statusCode).toBe(403)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({
      type: 'https://httpproblems.com/http-status/403',
      title: 'Geen toegang',
      status: 403,
      detail: 'Je hebt geen toegang tot deze assessment',
      instance: url,
    })
  })
})

describe('GET /assessments/:id/sync — lastModifiedBySelf === false', () => {
  it('reports lastModifiedBySelf false when no version row matches (LEFT JOIN null author)', async () => {
    // createAssessment sets currentVersion=1 but inserts no assessment_versions
    // row, so the LEFT JOIN yields latestVersionCreatedBy === null.
    // null === userId is false.
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const token = await tokenFor(owner)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/sync`,
      headers: authHeader(token),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(1)
    expect(typeof body.updatedAt).toBe('string')
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt)
    expect(body.lastModifiedBySelf).toBe(false)
    expect(body.commentCount).toBe(0)
  })

  it('reports lastModifiedBySelf false when the current version was authored by someone else', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')
    // currentVersion defaults to 1; author of v1 is the owner, not the editor.
    await addVersion(assessment.id, 1, owner)

    const token = await tokenFor(editor)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/sync`,
      headers: authHeader(token),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(1)
    expect(body.lastModifiedBySelf).toBe(false)
  })
})

describe('GET /assessments/:id/sync — lastModifiedBySelf === true', () => {
  it('reports lastModifiedBySelf true when the requesting user authored the current version', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')
    // Insert a version row matching currentVersion (1), authored by the requester.
    await addVersion(assessment.id, 1, owner)

    const token = await tokenFor(owner)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/sync`,
      headers: authHeader(token),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(1)
    expect(body.lastModifiedBySelf).toBe(true)
  })
})

describe('GET /assessments/:id/sync — commentCount aggregation', () => {
  it('returns the number of comments on the assessment (commentCount > 0)', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    // Two comments on this assessment.
    await db.insert(comments).values([
      { assessmentInstanceId: assessment.id, fieldId: '2.1', authorId: owner.id, body: 'Eerste' },
      { assessmentInstanceId: assessment.id, fieldId: '2.2', authorId: owner.id, body: 'Tweede' },
    ])

    const token = await tokenFor(owner)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/sync`,
      headers: authHeader(token),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().commentCount).toBe(2)

    // Sanity: the comments really are persisted under this assessment.
    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.assessmentInstanceId, assessment.id))
    expect(rows.length).toBe(2)

    // Sanity: the underlying instance row still exists with the expected version.
    const [instance] = await db
      .select({ currentVersion: assessmentInstances.currentVersion })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(instance.currentVersion).toBe(1)
  })
})

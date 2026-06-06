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

async function seedAssessmentFor(user: SeededUser, role: ProjectRole) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  const assessment = await createAssessment(project.id, user.id)
  return { project, assessment }
}

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

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.assessmentInstanceId, assessment.id))
    expect(rows.length).toBe(2)

    const [instance] = await db
      .select({ currentVersion: assessmentInstances.currentVersion })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(instance.currentVersion).toBe(1)
  })
})

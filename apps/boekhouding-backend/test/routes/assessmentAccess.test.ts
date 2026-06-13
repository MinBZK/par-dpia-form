// Integration tests for the shared requireAssessmentAccess middleware.
//
// Tests run the real Fastify app via app.inject() against a real Postgres test
// database. Auth is exercised end-to-end: real JWTs signed with a test keypair
// are verified by the unmodified requireAuth middleware against a loopback
// JWKS server. No auth code path is bypassed.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, createAssessment, type SeededUser } from '../helpers/fixtures.js'
import type { ProjectRole } from '../../src/middleware/projectAccess.js'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser, overrides: Partial<Parameters<typeof jwks.signToken>[0]> = {}) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email, ...overrides })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
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

// Helper: creates a project with `user` as the given role and returns an assessment in it.
async function seedAssessmentFor(user: SeededUser, role: ProjectRole) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  const assessment = await createAssessment(project.id, user.id)
  return { project, assessment }
}

describe('requireAssessmentAccess — GET /assessments/:id', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/assessments/${randomUUID()}` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token issuer is wrong', async () => {
    const user = await createUser()
    const token = await tokenFor(user, { iss: 'https://evil.example.com/realms/other' })
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when azp does not match configured audience', async () => {
    const user = await createUser()
    const token = await tokenFor(user, { azp: 'some-other-client' })
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when assessment does not exist', async () => {
    const user = await createUser()
    const token = await tokenFor(user)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 404, title: 'Niet gevonden' })
  })

  it('returns 403 (not 404) when assessment exists but user is not a project member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const token = await tokenFor(outsider)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ status: 403, detail: 'Geen lid van dit project' })
  })

  it('returns 200 when user is a viewer', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')

    const token = await tokenFor(viewer)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(assessment.id)
    expect(body.role).toBe('viewer')
  })

  it('returns 200 when user is the owner', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const token = await tokenFor(owner)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('owner')
  })
})

describe('requireAssessmentAccess — PUT /assessments/:id (editor minimum)', () => {
  it('returns 403 when user is only a viewer', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')

    const token = await tokenFor(viewer)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { name: 'renamed' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ detail: 'De rol bewerker is vereist' })
  })

  it('returns 403 when user is only a commenter', async () => {
    const owner = await createUser()
    const commenter = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, commenter.id, 'commenter')

    const token = await tokenFor(commenter)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { name: 'renamed' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows an editor to rename', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')

    const token = await tokenFor(editor)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { name: 'renamed-by-editor' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('renamed-by-editor')
  })
})

describe('requireAssessmentAccess — restore requires owner', () => {
  it('returns 403 when an editor attempts a restore (newVersion + changeDescription)', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')

    const token = await tokenFor(editor)
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: { answers: {} },
        newVersion: true,
        changeDescription: 'hersteld',
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().detail).toBe('De rol eigenaar is vereist')
  })
})

describe('requireAssessmentAccess — DELETE /assessments/:id (owner minimum)', () => {
  it('returns 403 when user is an editor', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')

    const token = await tokenFor(editor)
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 204 when user is the owner', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const token = await tokenFor(owner)
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(204)
  })
})

describe('GET /assessments/:id — response shape', () => {
  // Regression: the lean auth projection must still expose the scalar metadata
  // the editor needs. Without assessmentType the frontend falls back to DPIA,
  // so opening a pre-scan would render the DPIA form.
  it('includes assessmentType and name so the editor opens the correct form', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    const assessment = await createAssessment(project.id, owner.id, {
      assessmentType: 'prescan',
      name: 'Mijn pre-scan',
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.assessmentType).toBe('prescan')
    expect(body.name).toBe('Mijn pre-scan')
  })
})

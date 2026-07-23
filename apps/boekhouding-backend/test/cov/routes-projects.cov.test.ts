import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, createAssessment, type SeededUser } from '../helpers/fixtures.js'
import { db } from '../../src/db/connection.js'
import { assessmentInstances, assessmentVersions, assessmentEdits } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

const SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser, overrides: Partial<Parameters<typeof jwks.signToken>[0]> = {}) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email, ...overrides })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

async function projectWithRole(user: SeededUser, role: Parameters<typeof addMember>[2]) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  return project
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

describe('GET /api/v1/projects (list projects for current user)', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/projects' })
    expect(res.statusCode).toBe(401)
  })

  it('returns an empty list when the user has no memberships', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('returns only the projects the user is a member of, with the role', async () => {
    const user = await createUser()
    const other = await createUser()
    const mine = await projectWithRole(user, 'owner')
    await projectWithRole(other, 'owner')

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(mine.id)
    expect(body[0].role).toBe('owner')
    expect(body[0].name).toBe('Test project')
  })
})

describe('POST /api/v1/projects (create project)', () => {
  it('rejects a body without a name (schema validation)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('creates a project with a description and makes the creator the owner', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
      payload: { name: 'Met omschrijving', description: 'Een omschrijving' },
    })
    expect(res.statusCode).toBe(201)
    const project = res.json()
    expect(project.name).toBe('Met omschrijving')
    expect(project.description).toBe('Een omschrijving')

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
    })
    expect(list.json()).toMatchObject([{ id: project.id, role: 'owner' }])
  })

  it('defaults the description to an empty string when omitted (description || "")', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(user)),
      payload: { name: 'Zonder omschrijving' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().description).toBe('')
  })
})

describe('GET /api/v1/projects/:projectId (get project by id)', () => {
  it('returns 403 when the requester is not a project member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(outsider)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns the project together with the requester role for a viewer', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const project = await projectWithRole(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(viewer)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(project.id)
    expect(body.role).toBe('viewer')
  })
})

describe('PUT /api/v1/projects/:projectId (update project)', () => {
  it('returns 403 when a non-owner attempts an update', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectWithRole(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(editor)),
      payload: { name: 'nieuw' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('updates only the name when description is undefined', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { name: 'Alleen naam' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Alleen naam')
    expect(body.description).toBe('')
  })

  it('updates only the description when name is undefined', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { description: 'Alleen omschrijving' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Test project')
    expect(body.description).toBe('Alleen omschrijving')
  })

  it('updates both name and description when both are provided', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { name: 'Beide', description: 'Beide velden' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Beide')
    expect(body.description).toBe('Beide velden')
  })

  it('only bumps updatedAt when neither name nor description is provided', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Test project')
    expect(body.description).toBe('')
  })
})

describe('DELETE /api/v1/projects/:projectId (delete project)', () => {
  it('returns 403 when a non-owner attempts a delete', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectWithRole(owner, 'owner')
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(editor)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 204 and removes the project for the owner', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: authHeader(await tokenFor(owner)),
    })
    expect(list.json()).toEqual([])
  })
})

describe('GET /api/v1/projects/:projectId/assessments (list assessments)', () => {
  it('returns 403 when the requester is not a project member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(outsider)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns the assessments scoped to the project', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')
    const a = await createAssessment(project.id, owner.id, { name: 'A1' })

    const otherProject = await projectWithRole(owner, 'owner')
    await createAssessment(otherProject.id, owner.id, { name: 'Other' })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(a.id)
    expect(body[0].name).toBe('A1')
    // Data minimisation: the list must not leak the full assessment content.
    expect(body[0].cachedState).toBeUndefined()
    expect(body[0].state).toBeUndefined()
  })
})

describe('POST /api/v1/projects/:projectId/assessments (create assessment)', () => {
  it('rejects a body without assessmentType (schema validation)', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 403 when a viewer (below editor) attempts to create', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const project = await projectWithRole(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(viewer)),
      payload: { assessmentType: 'dpia' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('uses the provided name when given and stores the provided state', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')
    // A fully conforming state so create's normalise-then-validate is a no-op and
    // the stored value matches verbatim.
    const state = {
      $schema: SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z' },
      answers: { '0.1': { value: 'Inleiding', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { name: 'Eigen naam', assessmentType: 'dpia', state },
    })
    expect(res.statusCode).toBe(201)
    const created = res.json()
    expect(created.name).toBe('Eigen naam')
    expect(created.assessmentType).toBe('dpia')
    expect(created.cachedState).toEqual(state)

    const versions = await db
      .select()
      .from(assessmentVersions)
      .where(eq(assessmentVersions.assessmentInstanceId, created.id))
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe(1)

    const edits = await db
      .select()
      .from(assessmentEdits)
      .where(eq(assessmentEdits.assessmentVersionId, versions[0].id))
    expect(edits).toHaveLength(1)
    expect(edits[0].fieldId).toBe('__initial__')
    expect(edits[0].editType).toBe('initial_state')
    expect(edits[0].oldValue).toBeNull()
    expect(edits[0].newValue).toEqual(state)
  })

  it('defaults the DPIA name to "DPIA" for the first one and "DPIA 2" for the next', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { assessmentType: 'dpia' },
    })
    expect(first.statusCode).toBe(201)
    expect(first.json().name).toBe('DPIA')
    expect(first.json().cachedState).toEqual({})

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { assessmentType: 'dpia' },
    })
    expect(second.statusCode).toBe(201)
    expect(second.json().name).toBe('DPIA 2')
  })

  it('defaults the prescan name to "Pre-scan"', async () => {
    const owner = await createUser()
    const project = await projectWithRole(owner, 'owner')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { assessmentType: 'prescan' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Pre-scan')

    const rows = await db
      .select()
      .from(assessmentInstances)
      .where(eq(assessmentInstances.projectId, project.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].assessmentType).toBe('prescan')
  })
})

// Integration tests for request validation: path parameters, querystring and
// request bodies must be rejected with a 400 problem+json before any SQL runs.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, createAssessment, type SeededUser } from '../helpers/fixtures.js'
import { db } from '../../src/db/connection.js'
import { assessmentInstances } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

async function seedOwner() {
  const owner = await createUser()
  const project = await createProject(owner.id)
  await addMember(project.id, owner.id, 'owner')
  const assessment = await createAssessment(project.id, owner.id)
  return { owner, project, assessment, headers: authHeader(await tokenFor(owner)) }
}

function expectProblem400(res: Awaited<ReturnType<FastifyInstance['inject']>>) {
  expect(res.statusCode).toBe(400)
  expect(res.headers['content-type']).toContain('application/problem+json')
  expect(res.json().detail).toMatch(/^Ongeldige /)
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

describe('path parameters must be UUIDs', () => {
  it('rejects a non-UUID projectId instead of letting Postgres fail', async () => {
    const { headers } = await seedOwner()
    for (const url of [
      '/api/v1/projects/not-a-uuid',
      '/api/v1/projects/not-a-uuid/assessments',
      '/api/v1/projects/not-a-uuid/members',
    ]) {
      expectProblem400(await app.inject({ method: 'GET', url, headers }))
    }
  })

  it('rejects a non-UUID userId on a member update', async () => {
    const { project, headers } = await seedOwner()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/not-a-uuid`,
      headers,
      payload: { role: 'viewer' },
    })
    expectProblem400(res)
  })

  it('rejects a non-UUID assessmentId on every assessment route family', async () => {
    const { headers } = await seedOwner()
    for (const url of [
      '/api/v1/assessments/not-a-uuid',
      '/api/v1/assessments/not-a-uuid/versions',
      '/api/v1/assessments/not-a-uuid/edits',
      '/api/v1/assessments/not-a-uuid/comments',
      '/api/v1/assessments/not-a-uuid/sync',
    ]) {
      expectProblem400(await app.inject({ method: 'GET', url, headers }))
    }
  })

  it('rejects a non-UUID commentId', async () => {
    const { assessment, headers } = await seedOwner()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/not-a-uuid`,
      headers,
    })
    expectProblem400(res)
  })

  it('rejects a non-numeric version instead of reaching parseInt NaN', async () => {
    const { assessment, headers } = await seedOwner()
    expectProblem400(await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/abc`,
      headers,
    }))
    expectProblem400(await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/abc/edits`,
      headers,
    }))
    expectProblem400(await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/versions/0`,
      headers,
      payload: { changeDescription: 'x' },
    }))
  })
})

describe('querystring validation', () => {
  it('rejects an unparseable ?since instead of throwing on toISOString', async () => {
    const { assessment, headers } = await seedOwner()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments?since=garbage`,
      headers,
    })
    expectProblem400(res)
  })
})

describe('request body caps', () => {
  it('caps name and description on a project update, like create does', async () => {
    const { project, headers } = await seedOwner()
    expectProblem400(await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers,
      payload: { name: 'x'.repeat(201) },
    }))
    expectProblem400(await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers,
      payload: { description: 'x'.repeat(2001) },
    }))
  })

  it('strips an unknown field from a project update instead of storing it', async () => {
    const { project, headers } = await seedOwner()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers,
      payload: { name: 'Geldig', kwaadaardig: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('kwaadaardig')
  })

  it('rejects a malformed e-mail address when adding a member', async () => {
    const { project, headers } = await seedOwner()
    expectProblem400(await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers,
      payload: { email: 'geen-adres' },
    }))
    expectProblem400(await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers,
      payload: { email: `${'x'.repeat(250)}@example.com` },
    }))
  })

  it('rejects a wrongly typed or unknown field on an assessment save', async () => {
    const { assessment, headers } = await seedOwner()
    expectProblem400(await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers,
      payload: { name: 'x'.repeat(201) },
    }))
    expectProblem400(await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers,
      payload: { state: 'geen object', expectedVersion: 1 },
    }))
  })

  it('strips an unknown field from an assessment save', async () => {
    const { assessment, headers } = await seedOwner()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers,
      payload: { name: 'Geldig', onbekend: 1 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('onbekend')
  })

  it('caps the change description on a version update', async () => {
    const { assessment, headers } = await seedOwner()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/versions/1`,
      headers,
      payload: { changeDescription: 'x'.repeat(2001) },
    })
    expectProblem400(res)
  })

  it('caps the field id of a comment', async () => {
    const { assessment, headers } = await seedOwner()
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers,
      payload: { fieldId: 'x'.repeat(256), body: 'Een opmerking' },
    })
    expectProblem400(res)
  })

  it('still accepts a valid request through the same schemas', async () => {
    const { project, assessment, headers } = await seedOwner()
    const rename = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers,
      payload: { name: 'Nieuwe naam', description: 'Toelichting' },
    })
    expect(rename.statusCode).toBe(200)
    expect(rename.json().name).toBe('Nieuwe naam')

    const comment = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers,
      payload: { fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0', body: 'Een opmerking' },
    })
    expect(comment.statusCode).toBe(201)

    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers,
      payload: { email: `nieuw-${randomUUID().slice(0, 8)}@example.com`, role: 'viewer' },
    })
    expect(invite.statusCode).toBe(201)
    expect(invite.json().role).toBe('viewer')
  })
})

// Rows written before the v2 migration still carry a top-level `taskState` and a
// `metadata.activeNamespace`. The schema no longer defines those, but rejecting
// them would lock the owner out of an assessment that was never re-saved since.
describe('legacy state keys are stripped, not rejected', () => {
  const SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

  function legacyState() {
    return {
      $schema: SCHEMA_URL,
      metadata: {
        urn: 'urn:nl:dpia:3.0',
        createdAt: '2026-01-01T00:00:00.000Z',
        activeNamespace: 'dpia',
      },
      answers: { '0.1': { value: 'Projectnaam', lastEditedAt: '2026-01-01T00:00:00.000Z' } },
      taskState: { dpia: { completedRootTaskIds: ['0'] } },
      verzonnenSleutel: 'x'.repeat(1000),
    }
  }

  it('saves a state carrying legacy keys and stores it without them', async () => {
    const { assessment, headers } = await seedOwner()

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers,
      payload: { state: legacyState(), expectedVersion: 1 },
    })
    expect(res.statusCode).toBe(200)

    const [stored] = await db
      .select({ cachedState: assessmentInstances.cachedState })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    const cached = stored.cachedState as Record<string, unknown>
    expect(Object.keys(cached).sort()).toEqual(['$schema', 'answers', 'metadata'])
    expect(cached).not.toHaveProperty('taskState')
    expect(cached).not.toHaveProperty('verzonnenSleutel')
    expect(cached.metadata).not.toHaveProperty('activeNamespace')
    expect(cached.answers).toEqual({ '0.1': { value: 'Projectnaam', lastEditedAt: '2026-01-01T00:00:00.000Z' } })
  })

  // A 25 MB parse budget on every route turns a members POST into a cheap way to
  // make the server chew through megabytes. Only the two state-carrying routes
  // raise it; the rest inherit the small server default.
  it('refuses a body over the server default on a route that only takes fields', async () => {
    const { project, headers } = await seedOwner()

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}`,
      headers,
      payload: { name: 'Naam', description: 'x'.repeat(70 * 1024) },
    })
    expect(res.statusCode).toBe(413)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().detail).toContain('afbeeldingen')
  })

  it('accepts a state larger than the server default on the save route', async () => {
    const { assessment, headers } = await seedOwner()

    const big = {
      $schema: SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00.000Z' },
      answers: Object.fromEntries(
        Array.from({ length: 400 }, (_, i) => [
          `1.${i + 1}`,
          { value: 'x'.repeat(300), lastEditedAt: '2026-01-01T00:00:00.000Z' },
        ]),
      ),
    }
    expect(JSON.stringify(big).length).toBeGreaterThan(64 * 1024)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers,
      payload: { state: big, expectedVersion: 1 },
    })
    expect(res.statusCode).toBe(200)
  })

  it('creates an assessment from a state carrying legacy keys and stores it without them', async () => {
    const { project, headers } = await seedOwner()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers,
      payload: { assessmentType: 'dpia', state: legacyState() },
    })
    expect(res.statusCode).toBe(201)

    const cached = res.json().cachedState as Record<string, unknown>
    expect(Object.keys(cached).sort()).toEqual(['$schema', 'answers', 'metadata'])
    expect(cached.metadata).not.toHaveProperty('activeNamespace')
  })
})

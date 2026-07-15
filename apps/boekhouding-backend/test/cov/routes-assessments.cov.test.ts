import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { assessmentInstances, assessmentVersions, assessmentEdits } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'
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

const URN = 'urn:nl:dpia:3.0'
const OUTPUT_SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

function makeState(answers: Record<string, unknown>, completedTasks?: string[]) {
  return {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      createdAt: '2026-01-01T00:00:00Z',
      urn: URN,
      ...(completedTasks ? { completedTasks } : {}),
    },
    answers,
  }
}

const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

async function seedFor(user: SeededUser, role: ProjectRole, cachedState: unknown = {}) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  const assessment = await createAssessment(project.id, user.id, { cachedState })
  return { project, assessment }
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

describe('GET /assessments/:id', () => {
  it('returns 404 when no access (result null short-circuits the handler)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns the assessment with state when cachedState is present', async () => {
    const owner = await createUser()
    const state = makeState({ '0.1': answer('Inleiding') })
    const { assessment } = await seedFor(owner, 'owner', state)

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(assessment.id)
    expect(body.role).toBe('owner')
    expect(body.state).toEqual(state)
  })

  it('returns state: null when cachedState is falsy', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', {})
    // createAssessment coalesces null→{}, so null the column directly.
    await db
      .update(assessmentInstances)
      .set({ cachedState: null })
      .where(eq(assessmentInstances.id, assessment.id))

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().state).toBeNull()
  })
})

describe('PUT /assessments/:id', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(await tokenFor(user)),
      payload: { name: 'DPIA Klantenservice' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('name-only update (name && !state) renames without a new version', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { name: 'Hernoemd' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Hernoemd')
    const versions = await db
      .select()
      .from(assessmentVersions)
    expect(versions).toHaveLength(0)
  })

  it('returns 400 when neither name nor state is provided', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 400, detail: 'Gegevens of naam is verplicht' })
  })

  it('returns 400 when state is given without expectedVersion', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state: makeState({ '0.1': answer('X') }) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      status: 400,
      detail: 'expectedVersion is verplicht bij het opslaan van gegevens',
    })
  })

  it('returns 409 when expectedVersion does not match currentVersion', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 99 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      status: 409,
      detail: 'Assessment is gewijzigd door een andere gebruiker',
      currentVersion: 1,
    })
  })

  it('cachedState-only update when no content changes and no changeDescription', async () => {
    const owner = await createUser()
    const state = makeState({ '0.1': answer('Inleiding') })
    const { assessment } = await seedFor(owner, 'owner', state)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state, expectedVersion: 1 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(1)
    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(0)
  })

  it('treats null previousState as an empty diff (previousState ? ... : [] right-hand side)', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', {})
    await db
      .update(assessmentInstances)
      .set({ cachedState: null })
      .where(eq(assessmentInstances.id, assessment.id))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)
  })

  it('creates a new version with edits and applies name in the same save', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({ '0.1': answer('Inleiding') }, ['0']),
        expectedVersion: 1,
        name: 'Met naam',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.currentVersion).toBe(2)
    expect(body.name).toBe('Met naam')

    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(1)
    const edits = await db.select().from(assessmentEdits)
    expect(edits.length).toBeGreaterThan(0)
  })

  it('creates a new version without edits when changeDescription forces it on an unchanged state', async () => {
    const owner = await createUser()
    const state = makeState({ '0.1': answer('Inleiding') })
    const { assessment } = await seedFor(owner, 'owner', state)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state, expectedVersion: 1, changeDescription: 'Handmatige versie' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)

    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(1)
    expect(versions[0].changeDescription).toBe('Handmatige versie')
    const edits = await db.select().from(assessmentEdits)
    expect(edits).toHaveLength(0)
  })

  it('consolidates a second same-user save into the latest version', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    const first = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('Eerste') }), expectedVersion: 1 },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().currentVersion).toBe(2)

    const second = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState({ '0.1': answer('Eerste'), '0.2': answer('Tweede') }),
        expectedVersion: 2,
        name: 'Geconsolideerd',
      },
    })
    expect(second.statusCode).toBe(200)
    const body = second.json()
    expect(body.currentVersion).toBe(3)
    expect(body.name).toBe('Geconsolideerd')

    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe(3)
  })

  it('consolidates with edits.length === 0 when cachedState was nulled after a version existed', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('Eerste') }), expectedVersion: 1 },
    })
    const editsAfterFirst = await db.select().from(assessmentEdits)

    await db
      .update(assessmentInstances)
      .set({ cachedState: null })
      .where(eq(assessmentInstances.id, assessment.id))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('Eerste') }), expectedVersion: 2 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(3)
    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe(3)
    const editsAfterSecond = await db.select().from(assessmentEdits)
    expect(editsAfterSecond).toHaveLength(editsAfterFirst.length)
  })

  it('consolidates a same-user save without a name (if (name) false branch)', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('Eerste') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState({ '0.1': answer('Eerste'), '0.2': answer('Tweede') }),
        expectedVersion: 2,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(3)
    expect(res.json().name).toBe('Test assessment')
    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe(3)
  })

  it('consolidates without inserting edits when the consolidated save has no field changes', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    const state1 = makeState({ '0.1': answer('Eerste') })
    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: state1, expectedVersion: 1 },
    })

    const state2 = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { createdAt: '2026-02-02T00:00:00Z', urn: URN },
      answers: { '0.1': answer('Eerste') },
    }
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: state2, expectedVersion: 2 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)
  })

  it('consolidation branch runs with edits.length === 0 when changeDescription is set on second save', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    const state1 = makeState({ '0.1': answer('Eerste') })
    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: state1, expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: state1, expectedVersion: 2, changeDescription: 'Snapshot' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(3)
    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(2)
  })

  it('does NOT consolidate when the latest version was created by another user', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const { project, assessment } = await seedFor(owner, 'owner', makeState({}))
    await addMember(project.id, editor.id, 'editor')

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { state: makeState({ '0.1': answer('Eerste') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(editor)),
      payload: {
        state: makeState({ '0.1': answer('Eerste'), '0.2': answer('Tweede') }),
        expectedVersion: 2,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(3)
    const versions = await db.select().from(assessmentVersions)
    expect(versions).toHaveLength(2)
  })

  it('owner restore (newVersion + changeDescription) creates a version and requires owner', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({ '0.1': answer('Origineel') }))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({ '0.1': answer('Hersteld') }),
        newVersion: true,
        changeDescription: 'Hersteld naar versie 1',
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)
    const versions = await db.select().from(assessmentVersions)
    expect(versions[0].changeDescription).toBe('Hersteld naar versie 1')
  })
})

describe('PUT /assessments/:id — input hardening', () => {
  const imageAnswer = (data: string) => ({ value: { data }, lastEditedAt: '2026-01-01T00:00:00Z' })

  it('accepts a save with an allowed WebP image', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({ '0.1': imageAnswer('data:image/webp;base64,UklGRg==') }),
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentVersion).toBe(2)
    const [row] = await db
      .select({ cachedState: assessmentInstances.cachedState })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(JSON.stringify(row.cachedState)).toContain('data:image/webp;base64,UklGRg==')
  })

  it('rejects a save with an embedded SVG image (XSS vector) and writes nothing', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({ '0.1': imageAnswer('data:image/svg+xml;base64,PHN2Zz4=') }),
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().detail).toContain('afbeeldingsformaat')
    expect(await db.select().from(assessmentVersions)).toHaveLength(0)
    const [row] = await db
      .select({ cachedState: assessmentInstances.cachedState })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessment.id))
    expect(JSON.stringify(row.cachedState)).not.toContain('svg')
  })

  it('rejects an image nested in a grouped repeatable array', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({
          '2.1': [{ _index: 0, '2.1.1': imageAnswer('data:image/svg+xml;base64,PHN2Zz4=') }],
        }),
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('afbeeldingsformaat')
  })

  it('rejects a state with an invalid answer key', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: makeState({ 'invalid key with spaces': answer('x') }),
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('verwachte formaat')
  })

  it('rejects a state that omits the required $schema field', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {
        state: { metadata: { createdAt: '2026-01-01T00:00:00Z', urn: URN }, answers: {} },
        expectedVersion: 1,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toContain('verwachte formaat')
  })
})

describe('DELETE /assessments/:id', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${randomUUID()}`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 204 and removes the assessment when owner', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(after.statusCode).toBe(404)
  })
})

describe('GET /assessments/:id/versions', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/versions`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns version history joined with the creator display name', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveLength(1)
    expect(body[0].version).toBe(2)
    // createdByName comes from a join with a JWT-upserted display_name; exact value is non-deterministic.
    expect(typeof body[0].createdByName).toBe('string')
    expect(body[0].createdByName.length).toBeGreaterThan(0)
    expect(body[0].createdBy).toBe(owner.id)
  })
})

describe('GET /assessments/:id/versions/:version', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/versions/1`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when the version does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/42`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ status: 404, detail: 'Versie niet gevonden' })
  })

  it('returns version metadata without state by default (includeState !== "true")', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/2`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(2)
    expect(body.state).toBeUndefined()
  })

  it('returns rebuilt state when includeState=true', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/2?includeState=true`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(2)
    expect(body.state).toBeDefined()
  })

  it('serves a repeated old-version rebuild from cache (immutable path)', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    // Two labeled saves → distinct versions 2 and 3 (changeDescription blocks
    // consolidation), so version 2 is older than current (3) and thus immutable.
    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1, changeDescription: 'v2' },
    })
    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('Y') }), expectedVersion: 2, changeDescription: 'v3' },
    })

    const url = `/api/v1/assessments/${assessment.id}/versions/2?includeState=true`
    const first = await app.inject({ method: 'GET', url, headers: authHeader(token) })
    const second = await app.inject({ method: 'GET', url, headers: authHeader(token) })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    // Cache hit on the second call must return the identical rebuilt state.
    expect(second.json().state).toEqual(first.json().state)
  })
})

describe('GET /assessments/:id/versions/:version/edits', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/versions/1/edits`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when the version does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/42/edits`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ status: 404, detail: 'Versie niet gevonden' })
  })

  it('returns the edits for a version, each annotated with the version number', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/versions/2/edits`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0].version).toBe(2)
    expect(body[0].fieldId).toBe(`${URN}?=task_id=0.1`)
  })
})

describe('PATCH /assessments/:id/versions/:version', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${randomUUID()}/versions/1`,
      headers: authHeader(await tokenFor(user)),
      payload: { changeDescription: 'Tussenstand opgeslagen' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when the version does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/versions/42`,
      headers: authHeader(await tokenFor(owner)),
      payload: { changeDescription: 'iets' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ status: 404, detail: 'Versie niet gevonden' })
  })

  it('updates the change description of an existing version', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/versions/2`,
      headers: authHeader(token),
      payload: { changeDescription: 'Nieuwe omschrijving' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().changeDescription).toBe('Nieuwe omschrijving')
  })

  it('clears the change description to null when given an empty string (|| null)', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: {
        state: makeState({ '0.1': answer('X') }),
        expectedVersion: 1,
        changeDescription: 'Begin',
      },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/versions/2`,
      headers: authHeader(token),
      payload: { changeDescription: '' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().changeDescription).toBeNull()
  })
})

describe('GET /assessments/:id/edits', () => {
  it('returns 404 when no access (result null short-circuits)', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/edits`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns the full edit audit log across versions', async () => {
    const owner = await createUser()
    const { assessment } = await seedFor(owner, 'owner', makeState({}))
    const token = await tokenFor(owner)

    await app.inject({
      method: 'PUT',
      url: `/api/v1/assessments/${assessment.id}`,
      headers: authHeader(token),
      payload: { state: makeState({ '0.1': answer('X') }), expectedVersion: 1 },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/edits`,
      headers: authHeader(token),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0].assessment_edits).toBeDefined()
    expect(body[0].assessment_versions).toBeDefined()
  })
})

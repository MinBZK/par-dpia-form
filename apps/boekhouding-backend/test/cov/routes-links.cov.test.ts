import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { assessmentInstances, assessmentLinks } from '../../src/db/schema.js'
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

const CROSS_PROJECT = 'Je kunt alleen andere assessments uit hetzelfde project koppelen.'

async function headersFor(user: SeededUser) {
  return { authorization: `Bearer ${await jwks.signToken({ sub: user.oidcSub, email: user.email })}` }
}

async function setAge(assessmentId: string, minutesAgo: number) {
  await db.update(assessmentInstances)
    .set({ updatedAt: new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(assessmentInstances.id, assessmentId))
}

async function outgoingRows(assessmentId: string) {
  const rows = await db.select().from(assessmentLinks).where(eq(assessmentLinks.fromAssessmentId, assessmentId))
  return rows.map(r => r.toAssessmentId).sort()
}

// One project with an owner and a DPIA, IAMA and pre-scan in it.
async function seed(role: ProjectRole = 'owner') {
  const owner = await createUser()
  const project = await createProject(owner.id)
  await addMember(project.id, owner.id, role)
  const dpia = await createAssessment(project.id, owner.id, { name: 'DPIA', assessmentType: 'dpia' })
  const iama = await createAssessment(project.id, owner.id, { name: 'IAMA', assessmentType: 'iama' })
  const prescan = await createAssessment(project.id, owner.id, { name: 'Pre-scan', assessmentType: 'prescan' })
  return { owner, project, dpia, iama, prescan, headers: await headersFor(owner) }
}

function getLinks(id: string, headers: Record<string, string>) {
  return app.inject({ method: 'GET', url: `/api/v1/assessments/${id}/links`, headers })
}

function putLinks(id: string, headers: Record<string, string>, payload: unknown) {
  return app.inject({ method: 'PUT', url: `/api/v1/assessments/${id}/links`, headers, payload: payload as object })
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

describe('GET/PUT /assessments/:id/links — linking', () => {
  it('returns an empty list for an assessment without links', async () => {
    const { dpia, headers } = await seed()
    const res = await getLinks(dpia.id, headers)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ links: [] })
  })

  it('links, lists both directions, and returns the fresh list from PUT', async () => {
    const { dpia, iama, prescan, headers } = await seed()
    await setAge(dpia.id, 10)
    await setAge(prescan.id, 5)

    const put = await putLinks(iama.id, headers, { assessmentIds: [dpia.id] })
    expect(put.statusCode).toBe(200)
    const dpiaEntry = put.json().links[0]
    expect(put.json().links).toEqual([{
      assessmentId: dpia.id,
      assessmentType: 'dpia',
      name: 'DPIA',
      updatedAt: dpiaEntry.updatedAt,
      direction: 'outgoing',
    }])
    expect(new Date(dpiaEntry.updatedAt).toISOString()).toBe(dpiaEntry.updatedAt)

    await putLinks(dpia.id, headers, { assessmentIds: [prescan.id] })

    const fromDpia = (await getLinks(dpia.id, headers)).json().links
    expect(fromDpia.map((l: { assessmentId: string; direction: string; assessmentType: string }) =>
      [l.assessmentType, l.direction])).toEqual([
      // IAMA is newest (not aged), then the pre-scan (5 min ago).
      ['iama', 'incoming'],
      ['prescan', 'outgoing'],
    ])

    const fromPrescan = (await getLinks(prescan.id, headers)).json().links
    expect(fromPrescan).toMatchObject([{ assessmentId: dpia.id, direction: 'incoming' }])
  })

  it('orders by the linked assessment updatedAt, newest first', async () => {
    const { dpia, iama, prescan, headers } = await seed()
    await setAge(iama.id, 30)
    await setAge(prescan.id, 1)
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id, prescan.id] })

    const ids = (await getLinks(dpia.id, headers)).json().links.map((l: { assessmentId: string }) => l.assessmentId)
    expect(ids).toEqual([prescan.id, iama.id])

    await setAge(iama.id, 0)
    const reordered = (await getLinks(dpia.id, headers)).json().links.map((l: { assessmentId: string }) => l.assessmentId)
    expect(reordered).toEqual([iama.id, prescan.id])
  })

  it('lists an assessment linked both ways once per direction', async () => {
    const { dpia, iama, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })
    await putLinks(iama.id, headers, { assessmentIds: [dpia.id] })

    const links = (await getLinks(dpia.id, headers)).json().links
    expect(links.map((l: { assessmentId: string; direction: string }) => [l.assessmentId, l.direction])).toEqual([
      [iama.id, 'incoming'],
      [iama.id, 'outgoing'],
    ])
  })

  it('replaces only the outgoing set, leaving incoming links alone', async () => {
    const { dpia, iama, prescan, headers } = await seed()
    await putLinks(iama.id, headers, { assessmentIds: [dpia.id] })
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id, prescan.id] })
    expect(await outgoingRows(dpia.id)).toEqual([iama.id, prescan.id].sort())

    const res = await putLinks(dpia.id, headers, { assessmentIds: [prescan.id] })
    expect(res.statusCode).toBe(200)
    expect(await outgoingRows(dpia.id)).toEqual([prescan.id])
    // The IAMA's own outgoing link to the DPIA survives.
    expect(await outgoingRows(iama.id)).toEqual([dpia.id])
  })

  it('unlinks everything with an empty list', async () => {
    const { dpia, iama, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })

    const res = await putLinks(dpia.id, headers, { assessmentIds: [] })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ links: [] })
    expect(await outgoingRows(dpia.id)).toEqual([])
  })

  it('removes links in both directions when an assessment is deleted (cascade)', async () => {
    const { dpia, iama, prescan, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })
    await putLinks(prescan.id, headers, { assessmentIds: [dpia.id] })

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/assessments/${dpia.id}`, headers })
    expect(del.statusCode).toBe(204)

    expect(await db.select().from(assessmentLinks)).toEqual([])
    expect((await getLinks(iama.id, headers)).json()).toEqual({ links: [] })
    expect((await getLinks(prescan.id, headers)).json()).toEqual({ links: [] })
  })
})

describe('PUT /assessments/:id/links — rejected targets change nothing', () => {
  async function expectRejected(res: Awaited<ReturnType<typeof putLinks>>, url: string) {
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toEqual({
      type: 'https://httpproblems.com/http-status/400',
      title: 'Ongeldig verzoek',
      status: 400,
      detail: CROSS_PROJECT,
      instance: url,
    })
  }

  it('rejects an assessment from another project', async () => {
    const { owner, dpia, iama, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })
    const otherProject = await createProject(owner.id, 'Ander project')
    await addMember(otherProject.id, owner.id, 'owner')
    const foreign = await createAssessment(otherProject.id, owner.id)

    const res = await putLinks(dpia.id, headers, { assessmentIds: [foreign.id] })
    await expectRejected(res, `/api/v1/assessments/${dpia.id}/links`)
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })

  it('rejects linking an assessment to itself', async () => {
    const { dpia, iama, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })

    const res = await putLinks(dpia.id, headers, { assessmentIds: [iama.id, dpia.id] })
    await expectRejected(res, `/api/v1/assessments/${dpia.id}/links`)
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })

  it('rejects an unknown id, even next to a valid one', async () => {
    const { dpia, iama, prescan, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })

    const res = await putLinks(dpia.id, headers, { assessmentIds: [prescan.id, randomUUID()] })
    await expectRejected(res, `/api/v1/assessments/${dpia.id}/links`)
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })
})

describe('/assessments/:id/links — access', () => {
  it('returns 401 without a login', async () => {
    const id = randomUUID()
    expect((await app.inject({ method: 'GET', url: `/api/v1/assessments/${id}/links` })).statusCode).toBe(401)
    expect((await app.inject({
      method: 'PUT', url: `/api/v1/assessments/${id}/links`, payload: { assessmentIds: [] },
    })).statusCode).toBe(401)
  })

  it('returns 404 for an unknown assessment', async () => {
    const { headers } = await seed()
    const id = randomUUID()
    const get = await getLinks(id, headers)
    expect(get.statusCode).toBe(404)
    expect(get.json().detail).toBe('Assessment niet gevonden')
    expect((await putLinks(id, headers, { assessmentIds: [] })).statusCode).toBe(404)
  })

  it('returns 403 to a non-member, for reading and writing', async () => {
    const { dpia, iama } = await seed()
    const outsider = await headersFor(await createUser())

    const get = await getLinks(dpia.id, outsider)
    expect(get.statusCode).toBe(403)
    expect(get.headers['content-type']).toContain('application/problem+json')
    expect(get.json().detail).toBe('Geen lid van dit project')

    const put = await putLinks(dpia.id, outsider, { assessmentIds: [iama.id] })
    expect(put.statusCode).toBe(403)
    expect(await outgoingRows(dpia.id)).toEqual([])
  })

  it('lets a viewer read but not write', async () => {
    const { project, dpia, iama, headers } = await seed()
    await putLinks(dpia.id, headers, { assessmentIds: [iama.id] })
    const viewer = await createUser()
    await addMember(project.id, viewer.id, 'viewer')
    const viewerHeaders = await headersFor(viewer)

    const get = await getLinks(dpia.id, viewerHeaders)
    expect(get.statusCode).toBe(200)
    expect(get.json().links).toHaveLength(1)

    const put = await putLinks(dpia.id, viewerHeaders, { assessmentIds: [] })
    expect(put.statusCode).toBe(403)
    expect(put.json().detail).toBe('De rol bewerker is vereist')
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })

  it('lets an editor write', async () => {
    const { project, dpia, iama } = await seed()
    const editor = await createUser()
    await addMember(project.id, editor.id, 'editor')

    const put = await putLinks(dpia.id, await headersFor(editor), { assessmentIds: [iama.id] })
    expect(put.statusCode).toBe(200)
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })
})

describe('PUT /assessments/:id/links — body schema', () => {
  async function expectSchema400(id: string, headers: Record<string, string>, payload: unknown) {
    const res = await putLinks(id, headers, payload)
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().detail).toMatch(/^Ongeldige verzoekgegevens/)
  }

  it('rejects a non-UUID path parameter', async () => {
    const { headers } = await seed()
    const res = await putLinks('not-a-uuid', headers, { assessmentIds: [] })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toMatch(/^Ongeldige padparameters/)
  })

  it('rejects a missing or non-array list, a non-UUID, more than 20 ids and duplicates', async () => {
    const { dpia, iama, headers } = await seed()
    await expectSchema400(dpia.id, headers, {})
    await expectSchema400(dpia.id, headers, { assessmentIds: { id: iama.id } })
    await expectSchema400(dpia.id, headers, { assessmentIds: ['../projects'] })
    await expectSchema400(dpia.id, headers, { assessmentIds: Array.from({ length: 21 }, () => randomUUID()) })
    await expectSchema400(dpia.id, headers, { assessmentIds: [iama.id, iama.id] })
    expect(await outgoingRows(dpia.id)).toEqual([])
  })

  // Same ajv settings as every other route (Fastify defaults): unknown fields are
  // stripped rather than rejected, and a lone id is coerced to a one-item list.
  it('strips an unknown field and coerces a single id into a list', async () => {
    const { dpia, iama, headers } = await seed()
    const res = await putLinks(dpia.id, headers, { assessmentIds: iama.id, extra: true })
    expect(res.statusCode).toBe(200)
    expect(await outgoingRows(dpia.id)).toEqual([iama.id])
  })
})

describe('PUT /api/v1/assessments/:assessmentId/links — two saves at once', () => {
  it('lets the later save win instead of failing on the primary key', async () => {
    const { iama, dpia, prescan, headers } = await seed()

    const [first, second] = await Promise.all([
      putLinks(iama.id, headers, { assessmentIds: [dpia.id, prescan.id] }),
      putLinks(iama.id, headers, { assessmentIds: [dpia.id] }),
    ])

    expect([first.statusCode, second.statusCode]).toEqual([200, 200])
    // Serialised on the assessment row: the result is exactly one of the two sets.
    expect([[dpia.id, prescan.id].sort(), [dpia.id]]).toContainEqual(await outgoingRows(iama.id))
  })
})

// Integration tests pinning the auth identity-cache invariant: a cache hit
// skips ONLY the `sub`→internal-id lookup. Authorization is always
// re-checked live against project_members, so revoking access (or lowering a
// role) takes effect on the very next request, cache hit or not.
//
// Every case asserts the cache is warm right before the second request - without
// that assertion these tests would also pass on a cache miss, and would not pin
// the invariant at all.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/connection.js'
import { projectMembers } from '../../src/db/schema.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, createAssessment, type SeededUser } from '../helpers/fixtures.js'
import { userIdCache } from '../../src/utils/userIdCache.js'

let app: FastifyInstance
const jwks = getJwks()

async function authHeaderFor(user: SeededUser) {
  return { authorization: `Bearer ${await jwks.signToken({ sub: user.oidcSub, email: user.email })}` }
}

async function revokeMembership(projectId: string, userId: string) {
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
}

beforeAll(async () => {
  app = await buildApp({ logger: false })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await jwks.close()
})

// truncateAll() also clears the identity cache, so every case starts cold and
// warms the cache itself. Never call it halfway through a case.
beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('identity cache - authorization stays live', () => {
  it('refuses a cache-hit request after the membership is revoked', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'owner')
    const headers = await authHeaderFor(user)
    const url = `/api/v1/projects/${project.id}`

    const first = await app.inject({ method: 'GET', url, headers })
    expect(first.statusCode).toBe(200)
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)

    await revokeMembership(project.id, user.id)

    const second = await app.inject({ method: 'GET', url, headers })
    expect(second.statusCode).toBe(403)
    expect(second.json().detail).toBe('Geen lid van dit project')
    // Still a hit: the 403 came from the live membership check, not from an
    // expired or evicted cache entry falling back to the database.
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)
  })

  it('refuses a cache-hit write after the role is lowered', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'owner')
    const headers = await authHeaderFor(user)

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers,
      payload: { assessmentType: 'dpia', name: 'Eerste' },
    })
    expect(first.statusCode).toBe(201)
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)

    await db
      .update(projectMembers)
      .set({ role: 'viewer' })
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, user.id)))

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers,
      payload: { assessmentType: 'dpia', name: 'Tweede' },
    })
    expect(second.statusCode).toBe(403)
    expect(second.json().detail).toBe('De rol bewerker is vereist')
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)
  })

  it('refuses a cache-hit assessment request after the membership is revoked', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'owner')
    const assessment = await createAssessment(project.id, user.id)
    const headers = await authHeaderFor(user)
    const url = `/api/v1/assessments/${assessment.id}`

    const first = await app.inject({ method: 'GET', url, headers })
    expect(first.statusCode).toBe(200)
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)

    await revokeMembership(project.id, user.id)

    // 403, not 404: the assessment still exists, only the membership join is empty.
    const second = await app.inject({ method: 'GET', url, headers })
    expect(second.statusCode).toBe(403)
    expect(userIdCache.get(user.oidcSub, Date.now())).toBe(user.id)
  })

  it('refuses a cache-hit request after an owner removes the member through the API', async () => {
    const owner = await createUser()
    const member = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    await addMember(project.id, member.id, 'editor')
    const memberHeaders = await authHeaderFor(member)
    const url = `/api/v1/projects/${project.id}`

    const first = await app.inject({ method: 'GET', url, headers: memberHeaders })
    expect(first.statusCode).toBe(200)
    expect(userIdCache.get(member.oidcSub, Date.now())).toBe(member.id)

    const removal = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${member.id}`,
      headers: await authHeaderFor(owner),
    })
    expect(removal.statusCode).toBe(204)

    const second = await app.inject({ method: 'GET', url, headers: memberHeaders })
    expect(second.statusCode).toBe(403)
    expect(userIdCache.get(member.oidcSub, Date.now())).toBe(member.id)
  })
})

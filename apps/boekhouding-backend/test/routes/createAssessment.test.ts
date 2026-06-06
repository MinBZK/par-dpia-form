// Integration tests for POST /api/v1/projects/:projectId/assessments.
//
// Runs the real Fastify app via app.inject() against the Postgres test DB, with
// real JWTs verified end-to-end (same setup as assessmentAccess.test.ts).
// Covers creating each supported assessment type — including IAMA — and asserts
// the created type is echoed back.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, type SeededUser } from '../helpers/fixtures.js'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email })
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

// Creates a project with `user` as owner so the create endpoint's
// requireProjectAccess('editor') preHandler passes.
async function projectOwnedBy(user: SeededUser) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, 'owner')
  return project
}

describe('POST /projects/:projectId/assessments', () => {
  it.each(['dpia', 'prescan', 'iama'] as const)(
    'creates an assessment with assessmentType %s and echoes it back',
    async (assessmentType) => {
      const owner = await createUser()
      const project = await projectOwnedBy(owner)

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/assessments`,
        headers: authHeader(await tokenFor(owner)),
        payload: { assessmentType },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.assessmentType).toBe(assessmentType)
      expect(body.projectId).toBe(project.id)
      expect(typeof body.id).toBe('string')
    },
  )

  it('uses the IAMA base label when no name is supplied', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/assessments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { assessmentType: 'iama' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('IAMA')
  })
})

// Self-sufficient coverage tests for the requireProjectAccess middleware.
//
// The middleware factory returns an async handler that reads request.params,
// request.user and queries project_members against the real test DB. We drive
// the returned handler directly with mock FastifyRequest / FastifyReply objects
// so every branch — including the 400 (no projectId) and 401 (no user) guards
// that the real router never reaches (because :projectId is always present and
// requireAuth always sets request.user first) — is exercised here.
//
// The membership lookup hits the real Postgres test database, so we seed users,
// projects and memberships with the shared fixtures.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'node:crypto'
import { requireProjectAccess, type ProjectRole } from '../../src/middleware/projectAccess.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, type SeededUser } from '../helpers/fixtures.js'

// Records what the handler sent on the reply so assertions can inspect it.
interface CapturedReply {
  statusCode?: number
  contentType?: string
  body?: unknown
}

// Minimal chainable FastifyReply mock: status().type().send() like the source uses.
function makeReply(): { reply: FastifyReply; captured: CapturedReply } {
  const captured: CapturedReply = {}
  const reply = {
    status(code: number) {
      captured.statusCode = code
      return this
    },
    type(value: string) {
      captured.contentType = value
      return this
    },
    send(payload: unknown) {
      captured.body = payload
      return this
    },
  } as unknown as FastifyReply
  return { reply, captured }
}

// Minimal FastifyRequest mock carrying just what the middleware reads.
function makeRequest(opts: {
  projectId?: string
  user?: { id: string }
  url?: string
}): FastifyRequest {
  return {
    params: opts.projectId === undefined ? {} : { projectId: opts.projectId },
    user: opts.user,
    url: opts.url ?? '/api/v1/projects/x',
    projectRole: undefined,
  } as unknown as FastifyRequest
}

beforeAll(() => {
  // The migrations run in test/setup.ts; nothing extra to do here, but the
  // hook documents that the DB is ready before the membership query fires.
})

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('requireProjectAccess — guard branches that bypass the DB', () => {
  it('returns 400 problem+json when projectId is missing from params', async () => {
    const handler = requireProjectAccess('viewer')
    const { reply, captured } = makeReply()
    const request = makeRequest({ user: { id: randomUUID() }, url: '/api/v1/projects/' })

    await handler(request, reply)

    expect(captured.statusCode).toBe(400)
    expect(captured.contentType).toBe('application/problem+json')
    expect(captured.body).toMatchObject({
      type: 'https://httpproblems.com/http-status/400',
      title: 'Ongeldig verzoek',
      status: 400,
      detail: 'Project-ID is verplicht',
      instance: '/api/v1/projects/',
    })
    // The guard returns before touching projectRole.
    expect((request as { projectRole?: ProjectRole }).projectRole).toBeUndefined()
  })

  it('returns 401 problem+json when request.user is absent', async () => {
    const handler = requireProjectAccess('viewer')
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: randomUUID(), user: undefined, url: '/api/v1/projects/abc' })

    await handler(request, reply)

    expect(captured.statusCode).toBe(401)
    expect(captured.contentType).toBe('application/problem+json')
    expect(captured.body).toMatchObject({
      type: 'https://httpproblems.com/http-status/401',
      title: 'Niet geauthenticeerd',
      status: 401,
      detail: 'Niet ingelogd',
      instance: '/api/v1/projects/abc',
    })
  })
})

describe('requireProjectAccess — membership lookup against the real DB', () => {
  it('returns 403 "Geen lid van dit project" when there is no membership row', async () => {
    const user = await createUser()
    const owner = await createUser()
    // A project exists, but `user` is not a member of it.
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')

    const handler = requireProjectAccess('viewer')
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: project.id, user: { id: user.id } })

    await handler(request, reply)

    expect(captured.statusCode).toBe(403)
    expect(captured.contentType).toBe('application/problem+json')
    expect(captured.body).toMatchObject({
      type: 'https://httpproblems.com/http-status/403',
      title: 'Geen toegang',
      status: 403,
      detail: 'Geen lid van dit project',
    })
  })

  it('returns 403 with the required-role label when the user role is below the minimum', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    // user is only a viewer, but owner is required.
    await addMember(project.id, user.id, 'viewer')

    const handler = requireProjectAccess('owner')
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: project.id, user: { id: user.id } })

    await handler(request, reply)

    expect(captured.statusCode).toBe(403)
    expect(captured.body).toMatchObject({
      title: 'Geen toegang',
      status: 403,
      // roleLabels[minimumRole] => 'eigenaar' for owner.
      detail: 'De rol eigenaar is vereist',
    })
  })

  it('grants access and sets request.projectRole when the role meets the minimum exactly', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'editor')

    const handler = requireProjectAccess('editor')
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: project.id, user: { id: user.id } })

    const result = await handler(request, reply)

    // Success path returns undefined (no reply sent) and stamps the role.
    expect(result).toBeUndefined()
    expect(captured.statusCode).toBeUndefined()
    expect((request as { projectRole?: ProjectRole }).projectRole).toBe('editor')
  })

  it('grants access when the role exceeds the minimum (hierarchy comparison false branch)', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    await addMember(project.id, user.id, 'owner')

    const handler = requireProjectAccess('viewer')
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: project.id, user: { id: user.id } })

    await handler(request, reply)

    expect(captured.statusCode).toBeUndefined()
    expect((request as { projectRole?: ProjectRole }).projectRole).toBe('owner')
  })
})

describe('requireProjectAccess — default minimumRole parameter', () => {
  it('defaults to "viewer" when called with no argument, allowing any member', async () => {
    const user = await createUser()
    const project = await createProject(user.id)
    // viewer is the lowest role; the default minimum is also viewer, so this passes.
    await addMember(project.id, user.id, 'viewer')

    // No argument => exercises the `minimumRole: ProjectRole = 'viewer'` default.
    const handler = requireProjectAccess()
    const { reply, captured } = makeReply()
    const request = makeRequest({ projectId: project.id, user: { id: user.id } })

    await handler(request, reply)

    expect(captured.statusCode).toBeUndefined()
    expect((request as { projectRole?: ProjectRole }).projectRole).toBe('viewer')
  })
})

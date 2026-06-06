// Coverage test for src/routes/members.ts.
//
// Self-sufficient: drives the real Fastify app via app.inject() against a real
// Postgres test database, exercising every branch of the member routes
// (list / add / update role / remove). Auth is exercised end-to-end with real
// JWTs signed by the test keypair; project access is enforced by the
// unmodified requireProjectAccess middleware.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import { createUser, createProject, addMember, type SeededUser } from '../helpers/fixtures.js'
import { db } from '../../src/db/connection.js'
import { projectMembers, users } from '../../src/db/schema.js'
import { eq, and } from 'drizzle-orm'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser, overrides: Partial<Parameters<typeof jwks.signToken>[0]> = {}) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email, ...overrides })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

// Creates a project owned by `owner` (added as a member with role 'owner').
async function projectOwnedBy(owner: SeededUser) {
  const project = await createProject(owner.id)
  await addMember(project.id, owner.id, 'owner')
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

describe('GET /:projectId/members', () => {
  it('returns 403 when the requester is not a project member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(outsider)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('lists members (joined with users) for a viewer', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, viewer.id, 'viewer')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(viewer)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ userId: string; email: string; role: string }>
    expect(body).toHaveLength(2)
    const byUser = Object.fromEntries(body.map((m) => [m.userId, m]))
    expect(byUser[owner.id].role).toBe('owner')
    expect(byUser[owner.id].email).toBe(owner.email)
    expect(byUser[viewer.id].role).toBe('viewer')
  })
})

describe('POST /:projectId/members', () => {
  it('returns 403 when the requester is not an owner', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(editor)),
      payload: { email: 'someone@example.com' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when email is missing', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'editor' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json()).toMatchObject({ status: 400, detail: 'E-mailadres is verplicht' })
  })

  it('creates a placeholder user when the email is unknown and adds them (default role editor)', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const newEmail = `New-Person-${randomUUID().slice(0, 8)}@Example.com`
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(owner)),
      payload: { email: newEmail },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { userId: string; role: string }
    // No role in body => default 'editor' branch of `role || 'editor'`.
    expect(body.role).toBe('editor')

    // Placeholder user created with normalized (lowercased) email + email as displayName.
    const [created] = await db
      .select()
      .from(users)
      .where(eq(users.id, body.userId))
      .limit(1)
    expect(created.email).toBe(newEmail.toLowerCase())
    expect(created.displayName).toBe(newEmail.toLowerCase())

    // Membership persisted with the resolved role.
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, body.userId)))
      .limit(1)
    expect(membership.role).toBe('editor')
  })

  it('reuses an existing user (no placeholder created) and honours an explicit role', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)
    const existingUser = await createUser({ email: `existing-${randomUUID().slice(0, 8)}@example.com` })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      // Upper-cased email exercises the normalize-to-lowercase lookup of the existing user.
      headers: authHeader(await tokenFor(owner)),
      payload: { email: existingUser.email.toUpperCase(), role: 'commenter' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { userId: string; role: string }
    expect(body.userId).toBe(existingUser.id)
    expect(body.role).toBe('commenter')
  })

  it('returns 409 when the user is already a member', async () => {
    const owner = await createUser()
    const member = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, member.id, 'editor')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(owner)),
      payload: { email: member.email },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ status: 409, detail: 'Dit e-mailadres is al toegevoegd' })
  })

  it('returns 400 for an invalid role', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)
    const target = await createUser()

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${project.id}/members`,
      headers: authHeader(await tokenFor(owner)),
      payload: { email: target.email, role: 'superadmin' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ status: 400 })
    expect(res.json().detail).toContain('Ongeldige rol: superadmin')
  })
})

describe('PUT /:projectId/members/:userId', () => {
  it('returns 403 when the requester is not an owner', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${owner.id}`,
      headers: authHeader(await tokenFor(editor)),
      payload: { role: 'viewer' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 400 when role is missing', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${owner.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ status: 400, detail: 'Rol is verplicht' })
  })

  it('returns 404 when the target membership does not exist', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${randomUUID()}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'viewer' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ status: 404, detail: 'Lid niet gevonden' })
  })

  it('returns 400 when demoting the last remaining owner', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${owner.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'editor' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ status: 400, detail: 'Er moet minimaal één eigenaar zijn' })
  })

  it('demotes an owner when another owner remains', async () => {
    const owner = await createUser()
    const secondOwner = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, secondOwner.id, 'owner')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${secondOwner.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'editor' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('editor')
  })

  it('updates a non-owner member (skips the owner-guard branch)', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${editor.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'viewer' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('viewer')
  })

  it('promotes an owner to owner (currentRole owner but role === owner, owner-guard short-circuits)', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    // currentMembership.role === 'owner' is true, but role !== 'owner' is false,
    // so the `&&` short-circuits and the owner-count guard is skipped.
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${project.id}/members/${owner.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { role: 'owner' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('owner')
  })
})

describe('DELETE /:projectId/members/:userId', () => {
  it('returns 403 when the requester is not an owner', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${editor.id}`,
      headers: authHeader(await tokenFor(editor)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when the target membership does not exist', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${randomUUID()}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ status: 404, detail: 'Lid niet gevonden' })
  })

  it('returns 400 when removing the last remaining owner', async () => {
    const owner = await createUser()
    const project = await projectOwnedBy(owner)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${owner.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ status: 400, detail: 'Er moet minimaal één eigenaar zijn' })
  })

  it('removes an owner when another owner remains', async () => {
    const owner = await createUser()
    const secondOwner = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, secondOwner.id, 'owner')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${secondOwner.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)

    const remaining = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, secondOwner.id)))
      .limit(1)
    expect(remaining).toHaveLength(0)
  })

  it('removes a non-owner member (skips the owner-guard branch)', async () => {
    const owner = await createUser()
    const editor = await createUser()
    const project = await projectOwnedBy(owner)
    await addMember(project.id, editor.id, 'editor')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}/members/${editor.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)
  })
})

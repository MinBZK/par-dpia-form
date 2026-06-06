import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { getJwks } from '../helpers/testContext.js'
import { truncateAll } from '../helpers/testDb.js'
import {
  createUser,
  createProject,
  addMember,
  createAssessment,
  type SeededUser,
} from '../helpers/fixtures.js'
import { db } from '../../src/db/connection.js'
import { comments } from '../../src/db/schema.js'
import type { ProjectRole } from '../../src/middleware/projectAccess.js'

let app: FastifyInstance
const jwks = getJwks()

async function tokenFor(user: SeededUser) {
  return jwks.signToken({ sub: user.oidcSub, email: user.email })
}

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}

async function seedComment(values: {
  assessmentInstanceId: string
  fieldId?: string
  parentId?: string | null
  authorId: string
  body?: string
  resolvedAt?: Date | null
  resolvedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}) {
  const [row] = await db
    .insert(comments)
    .values({
      assessmentInstanceId: values.assessmentInstanceId,
      fieldId: values.fieldId ?? '1.1',
      parentId: values.parentId ?? null,
      authorId: values.authorId,
      body: values.body ?? 'Een opmerking',
      resolvedAt: values.resolvedAt ?? null,
      resolvedBy: values.resolvedBy ?? null,
      ...(values.createdAt ? { createdAt: values.createdAt } : {}),
      ...(values.updatedAt ? { updatedAt: values.updatedAt } : {}),
    })
    .returning()
  return row
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

async function seedAssessmentFor(user: SeededUser, role: ProjectRole) {
  const project = await createProject(user.id)
  await addMember(project.id, user.id, role)
  const assessment = await createAssessment(project.id, user.id)
  return { project, assessment }
}

describe('GET /assessments/:id/comments — access control', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/comments`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when the assessment does not exist', async () => {
    const user = await createUser()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${randomUUID()}/comments`,
      headers: authHeader(await tokenFor(user)),
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when the user is not a project member', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(outsider)),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /assessments/:id/comments — bulk load (no since)', () => {
  it('returns an empty list with null lastModifiedAt when there are no comments', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.comments).toEqual([])
    expect(body.lastModifiedAt).toBeNull()
    expect(body.currentUserId).toBe(owner.id)
  })

  it('returns threaded roots with replies, and resolves resolvedByName', async () => {
    const owner = await createUser()
    const replier = await createUser()
    const resolver = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, replier.id, 'commenter')
    await addMember(project.id, resolver.id, 'editor')

    const root1 = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      body: 'Eerste opmerking',
      resolvedAt: new Date('2026-03-20T10:00:00Z'),
      resolvedBy: resolver.id,
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: new Date('2026-03-20T10:00:00Z'),
    })
    const root2 = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      body: 'Tweede opmerking',
      createdAt: new Date('2026-03-20T11:00:00Z'),
      updatedAt: new Date('2026-03-20T11:00:00Z'),
    })
    await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: root1.id,
      authorId: replier.id,
      body: 'Een reactie',
      createdAt: new Date('2026-03-20T12:00:00Z'),
      updatedAt: new Date('2026-03-20T12:30:00Z'),
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.comments).toHaveLength(2)

    const first = body.comments.find((c: any) => c.id === root1.id)
    expect(first.resolvedByName).toBe(resolver.displayName)
    expect(first.replies).toHaveLength(1)
    expect(first.replies[0].body).toBe('Een reactie')
    expect(first.replies[0].authorName).toBe(replier.displayName)

    const second = body.comments.find((c: any) => c.id === root2.id)
    expect(second.resolvedByName).toBeNull()
    expect(second.replies).toEqual([])

    expect(body.lastModifiedAt).toBe(new Date('2026-03-20T12:30:00Z').toISOString())
  })

})

describe('GET /assessments/:id/comments — polling (?since=)', () => {
  it('returns only recently-changed comments and a derived lastModifiedAt', async () => {
    const owner = await createUser()
    const resolver = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, resolver.id, 'editor')

    const since = new Date('2026-03-20T12:00:00Z')

    const oldRoot = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      body: 'Oud',
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: new Date('2026-03-20T09:30:00Z'),
    })
    const recentRoot = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      body: 'Nieuw',
      resolvedAt: new Date('2026-03-20T13:00:00Z'),
      resolvedBy: resolver.id,
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: new Date('2026-03-20T13:30:00Z'),
    })
    await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: oldRoot.id,
      authorId: owner.id,
      body: 'Nieuwe reactie',
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: new Date('2026-03-20T14:00:00Z'),
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments?since=${encodeURIComponent(since.toISOString())}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    const ids = body.comments.map((c: any) => c.id)
    expect(ids).toContain(recentRoot.id)
    expect(ids).not.toContain(oldRoot.id)

    const recent = body.comments.find((c: any) => c.id === recentRoot.id)
    expect(recent.resolvedByName).toBe(resolver.displayName)

    const reply = body.comments.find((c: any) => c.body === 'Nieuwe reactie')
    expect(reply.resolvedByName).toBeNull()

    expect(body.lastModifiedAt).toBe(new Date('2026-03-20T14:00:00Z').toISOString())
    expect(body.currentUserId).toBe(owner.id)
  })

  it('returns a single recently-changed root with its own updatedAt as lastModifiedAt', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const rootUpdated = new Date('2026-03-20T10:00:00Z')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      createdAt: new Date('2026-03-20T09:00:00Z'),
      updatedAt: rootUpdated,
    })

    const since = new Date('2026-03-20T09:30:00Z')
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments?since=${encodeURIComponent(since.toISOString())}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0].id).toBe(root.id)
    expect(body.lastModifiedAt).toBe(rootUpdated.toISOString())
  })

  it('skips the reply/polling branch entirely when there are no root comments and since is set', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')
    const since = new Date('2026-03-20T12:00:00Z')

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/assessments/${assessment.id}/comments?since=${encodeURIComponent(since.toISOString())}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.comments).toEqual([])
    expect(body.lastModifiedAt).toBeNull()
  })
})

describe('POST /assessments/:id/comments — access control & validation', () => {
  it('returns 403 when the user is only a viewer', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(viewer)),
      payload: { fieldId: '1.1', body: 'Hoi' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects an empty body via schema validation', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'owner')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { fieldId: '1.1', body: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /assessments/:id/comments — create', () => {
  it('creates a root comment and returns 201 with authorName', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { fieldId: '2.1', body: 'Mijn opmerking' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.fieldId).toBe('2.1')
    expect(body.parentId).toBeNull()
    expect(body.body).toBe('Mijn opmerking')
    // JWT carries only `email`, so the synced displayName equals the email.
    expect(body.authorName).toBe(owner.email)
  })

  it('creates a reply to an existing root comment', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { fieldId: '1.1', body: 'Mijn reactie', parentId: root.id },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.parentId).toBe(root.id)
    expect(body.authorName).toBe(owner.email)
  })

  it('returns 404 when the parent comment does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { fieldId: '1.1', body: 'Reactie', parentId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    expect(res.json().detail).toBe('Bovenliggend commentaar niet gevonden')
  })

  it('returns 400 when replying to a reply (only one nesting level allowed)', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })
    const reply = await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: root.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/assessments/${assessment.id}/comments`,
      headers: authHeader(await tokenFor(owner)),
      payload: { fieldId: '1.1', body: 'Reactie op reactie', parentId: reply.id },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detail).toBe('Reageren op een reactie is niet toegestaan')
  })
})

describe('PATCH /assessments/:id/comments/:commentId — edit body', () => {
  it('returns 403 when a viewer tries to edit (commenter required)', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(viewer)),
      payload: { body: 'Aangepast' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when the comment does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${randomUUID()}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { body: 'Aangepast' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().detail).toBe('Commentaar niet gevonden')
  })

  it('returns 403 when a non-author tries to edit the body', async () => {
    const owner = await createUser()
    const other = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, other.id, 'commenter')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(other)),
      payload: { body: 'Probeer te bewerken' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().detail).toBe('Alleen de auteur kan dit commentaar bewerken')
  })

  it('lets the author edit the body', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      body: 'Origineel',
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { body: 'Bijgewerkt' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().body).toBe('Bijgewerkt')
  })
})

describe('PATCH /assessments/:id/comments/:commentId — resolve/reopen', () => {
  it('returns 403 when a commenter tries to resolve (editor required)', async () => {
    const owner = await createUser()
    const commenter = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, commenter.id, 'commenter')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(commenter)),
      payload: { resolvedAt: new Date('2026-03-20T10:00:00Z').toISOString() },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 with a reply-specific message when resolving a reply', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'editor')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })
    const reply = await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: root.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${reply.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { resolvedAt: new Date('2026-03-20T10:00:00Z').toISOString() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().detail).toBe('Commentaar niet gevonden of is een reactie')
  })

  it('resolves a root comment, setting resolvedAt and resolvedBy', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'editor')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const resolvedAt = new Date('2026-03-20T10:00:00Z').toISOString()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { resolvedAt },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.resolvedAt).toBe(resolvedAt)
    expect(body.resolvedBy).toBe(owner.id)
  })

  it('reopens a resolved root comment when resolvedAt is null', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'editor')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
      resolvedAt: new Date('2026-03-20T10:00:00Z'),
      resolvedBy: owner.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(owner)),
      payload: { resolvedAt: null },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.resolvedAt).toBeNull()
    expect(body.resolvedBy).toBeNull()
  })
})

describe('DELETE /assessments/:id/comments/:commentId', () => {
  it('returns 403 when a viewer tries to delete (commenter required)', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, viewer.id, 'viewer')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(viewer)),
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when the comment does not exist', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/${randomUUID()}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().detail).toBe('Commentaar niet gevonden')
  })

  it('returns 403 when a commenter tries to delete another user\'s comment', async () => {
    const owner = await createUser()
    const commenter = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, commenter.id, 'commenter')
    const comment = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/${comment.id}`,
      headers: authHeader(await tokenFor(commenter)),
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().detail).toBe('Geen rechten om dit commentaar te verwijderen')
  })

  it('lets the author delete their own root comment and cascades to replies', async () => {
    const owner = await createUser()
    const { assessment } = await seedAssessmentFor(owner, 'commenter')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: owner.id,
    })
    const reply = await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: root.id,
      authorId: owner.id,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/${root.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)

    const remaining = await db.select().from(comments)
    const ids = remaining.map((c) => c.id)
    expect(ids).not.toContain(root.id)
    expect(ids).not.toContain(reply.id)
  })

  it('lets an owner delete a reply (non-root) authored by someone else', async () => {
    const owner = await createUser()
    const author = await createUser()
    const { project, assessment } = await seedAssessmentFor(owner, 'owner')
    await addMember(project.id, author.id, 'commenter')
    const root = await seedComment({
      assessmentInstanceId: assessment.id,
      authorId: author.id,
    })
    const reply = await seedComment({
      assessmentInstanceId: assessment.id,
      parentId: root.id,
      authorId: author.id,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/assessments/${assessment.id}/comments/${reply.id}`,
      headers: authHeader(await tokenFor(owner)),
    })
    expect(res.statusCode).toBe(204)

    const remaining = await db.select().from(comments)
    const ids = remaining.map((c) => c.id)
    expect(ids).toContain(root.id)
    expect(ids).not.toContain(reply.id)
  })
})

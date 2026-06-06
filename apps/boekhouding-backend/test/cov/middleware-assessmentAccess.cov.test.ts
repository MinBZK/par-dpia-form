// Unit/integration coverage for the shared requireAssessmentAccess middleware.
//
// The middleware is a plain async function taking (assessmentId, userId,
// minimumRole, requestUrl, reply, options?). We exercise it directly against the
// real Postgres test database, seeding rows via the same fixtures the route
// tests use, and pass a lightweight FastifyReply stub that records what the
// middleware writes. This covers every branch (404 / 403 not-member /
// 403 role-too-low / success) plus both sides of the includeState selection.
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyReply } from 'fastify'
import { randomUUID } from 'node:crypto'
import { requireAssessmentAccess } from '../../src/middleware/assessmentAccess.js'
import { truncateAll } from '../helpers/testDb.js'
import {
  createUser,
  createProject,
  addMember,
  createAssessment,
} from '../helpers/fixtures.js'

// Minimal FastifyReply stub: the middleware only uses status().type().send().
// We capture them so assertions can inspect the problem+json payload.
interface CapturedReply {
  reply: FastifyReply
  statusCode: number | null
  contentType: string | null
  body: unknown
}

function makeReply(): CapturedReply {
  const captured: CapturedReply = {
    statusCode: null,
    contentType: null,
    body: undefined,
    reply: undefined as unknown as FastifyReply,
  }
  const chain = {
    status(code: number) {
      captured.statusCode = code
      return chain
    },
    type(ct: string) {
      captured.contentType = ct
      return chain
    },
    send(payload: unknown) {
      captured.body = payload
      return chain
    },
  }
  captured.reply = chain as unknown as FastifyReply
  return captured
}

beforeEach(async () => {
  await truncateAll(process.env.DATABASE_SERVER_FULL!)
})

describe('requireAssessmentAccess — 404 when assessment does not exist', () => {
  it('sends problem+json 404 and returns null', async () => {
    const user = await createUser()
    const cap = makeReply()
    const requestUrl = '/api/v1/assessments/does-not-exist'

    const result = await requireAssessmentAccess(
      randomUUID(),
      user.id,
      'viewer',
      requestUrl,
      cap.reply,
    )

    expect(result).toBeNull()
    expect(cap.statusCode).toBe(404)
    expect(cap.contentType).toBe('application/problem+json')
    expect(cap.body).toMatchObject({
      type: 'https://httpproblems.com/http-status/404',
      title: 'Niet gevonden',
      status: 404,
      detail: 'Assessment niet gevonden',
      instance: requestUrl,
    })
  })
})

describe('requireAssessmentAccess — 403 when user is not a project member', () => {
  it('sends problem+json 403 with "Geen lid van dit project" and returns null', async () => {
    const owner = await createUser()
    const outsider = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    const assessment = await createAssessment(project.id, owner.id)

    const cap = makeReply()
    const requestUrl = `/api/v1/assessments/${assessment.id}`

    const result = await requireAssessmentAccess(
      assessment.id,
      outsider.id, // not a member: LEFT JOIN yields null memberRole
      'viewer',
      requestUrl,
      cap.reply,
    )

    expect(result).toBeNull()
    expect(cap.statusCode).toBe(403)
    expect(cap.contentType).toBe('application/problem+json')
    expect(cap.body).toMatchObject({
      type: 'https://httpproblems.com/http-status/403',
      title: 'Geen toegang',
      status: 403,
      detail: 'Geen lid van dit project',
      instance: requestUrl,
    })
  })
})

describe('requireAssessmentAccess — 403 when role is below the minimum', () => {
  it('sends problem+json 403 with the required-role label and returns null', async () => {
    const owner = await createUser()
    const viewer = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    await addMember(project.id, viewer.id, 'viewer')
    const assessment = await createAssessment(project.id, owner.id)

    const cap = makeReply()
    const requestUrl = `/api/v1/assessments/${assessment.id}`

    // viewer (0) < editor (2): member exists but role too low -> else branch of
    // the detail ternary.
    const result = await requireAssessmentAccess(
      assessment.id,
      viewer.id,
      'editor',
      requestUrl,
      cap.reply,
    )

    expect(result).toBeNull()
    expect(cap.statusCode).toBe(403)
    expect(cap.body).toMatchObject({
      status: 403,
      detail: 'De rol bewerker is vereist',
    })
  })
})

describe('requireAssessmentAccess — success without state (default options)', () => {
  it('returns the lean auth row and role, no cachedState, no reply written', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    const assessment = await createAssessment(project.id, owner.id, {
      assessmentType: 'prescan',
      name: 'Mijn pre-scan',
    })

    const cap = makeReply()

    const result = await requireAssessmentAccess(
      assessment.id,
      owner.id,
      'viewer',
      `/api/v1/assessments/${assessment.id}`,
      cap.reply,
    )

    expect(result).not.toBeNull()
    expect(cap.statusCode).toBeNull() // nothing sent on the happy path
    expect(result!.role).toBe('owner')
    expect(result!.assessment.id).toBe(assessment.id)
    expect(result!.assessment.projectId).toBe(project.id)
    expect(result!.assessment.assessmentType).toBe('prescan')
    expect(result!.assessment.name).toBe('Mijn pre-scan')
    expect(result!.assessment.currentVersion).toBe(1)
    expect(result!.assessment.createdAt).toBeInstanceOf(Date)
    expect(result!.assessment.updatedAt).toBeInstanceOf(Date)
    // memberRole is stripped via destructuring; cachedState absent in lean projection.
    expect(result!.assessment).not.toHaveProperty('memberRole')
    expect(result!.assessment).not.toHaveProperty('cachedState')
  })
})

describe('requireAssessmentAccess — success with includeState: true', () => {
  it('returns the row including cachedState (truthy includeState branch)', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'editor')
    const cachedState = { answers: { '0.1': { value: 'Inleiding' } } }
    const assessment = await createAssessment(project.id, owner.id, { cachedState })

    const cap = makeReply()

    const result = await requireAssessmentAccess(
      assessment.id,
      owner.id,
      'editor',
      `/api/v1/assessments/${assessment.id}`,
      cap.reply,
      { includeState: true },
    )

    expect(result).not.toBeNull()
    expect(cap.statusCode).toBeNull()
    expect(result!.role).toBe('editor')
    expect((result!.assessment as { cachedState: unknown }).cachedState).toEqual(cachedState)
    expect(result!.assessment).not.toHaveProperty('memberRole')
  })

  it('treats includeState: false as the lean projection (falsy includeState branch)', async () => {
    const owner = await createUser()
    const project = await createProject(owner.id)
    await addMember(project.id, owner.id, 'owner')
    const assessment = await createAssessment(project.id, owner.id)

    const cap = makeReply()

    const result = await requireAssessmentAccess(
      assessment.id,
      owner.id,
      'viewer',
      `/api/v1/assessments/${assessment.id}`,
      cap.reply,
      { includeState: false },
    )

    expect(result).not.toBeNull()
    expect(result!.assessment).not.toHaveProperty('cachedState')
  })
})

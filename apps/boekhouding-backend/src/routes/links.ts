import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, assessmentLinks } from '../db/schema.js'
import { eq, and, or, asc, desc, inArray, sql } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireAssessmentAccess } from '../middleware/assessmentAccess.js'
import { assessmentParams, dutchSchemaErrorFormatter } from '../utils/routeSchemas.js'

// One PUT replaces the whole outgoing set, so the cap bounds both the request
// and the number of rows a single assessment can point at.
const MAX_LINKS = 20

const linksResponse = {
  type: 'object',
  required: ['links'],
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        required: ['assessmentId', 'assessmentType', 'name', 'updatedAt', 'direction'],
        properties: {
          assessmentId: { type: 'string', format: 'uuid' },
          assessmentType: { type: 'string', enum: ['prescan', 'dpia', 'iama'] },
          name: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
          direction: { type: 'string', enum: ['outgoing', 'incoming'] },
        },
      },
    },
  },
} as const

// Both directions in one query: a link row matches when this assessment is
// either end, and the join picks the other end. Self-links are rejected on
// write, so a row never matches both join arms. An assessment linked both ways
// yields two entries (one per direction).
async function listLinks(assessmentId: string) {
  const direction = sql<'outgoing' | 'incoming'>`case when ${assessmentLinks.fromAssessmentId} = ${assessmentId} then 'outgoing' else 'incoming' end`
  const rows = await db
    .select({
      assessmentId: assessmentInstances.id,
      assessmentType: assessmentInstances.assessmentType,
      name: assessmentInstances.name,
      updatedAt: assessmentInstances.updatedAt,
      direction,
    })
    .from(assessmentLinks)
    .innerJoin(
      assessmentInstances,
      or(
        and(eq(assessmentLinks.fromAssessmentId, assessmentId), eq(assessmentInstances.id, assessmentLinks.toAssessmentId)),
        and(eq(assessmentLinks.toAssessmentId, assessmentId), eq(assessmentInstances.id, assessmentLinks.fromAssessmentId)),
      ),
    )
    .where(or(eq(assessmentLinks.fromAssessmentId, assessmentId), eq(assessmentLinks.toAssessmentId, assessmentId)))
    .orderBy(desc(assessmentInstances.updatedAt), asc(assessmentInstances.id), asc(direction))

  return { links: rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() })) }
}

export async function assessmentLinkRoutes(app: FastifyInstance) {
  app.setSchemaErrorFormatter(dutchSchemaErrorFormatter)

  app.addHook('preHandler', requireAuth)

  // List linked assessments (outgoing and incoming)
  app.get<{
    Params: { assessmentId: string }
  }>('/:assessmentId/links', {
    schema: {
      tags: ['assessments'],
      description: 'Gekoppelde assessments uit hetzelfde project, in beide richtingen, nieuwst gewijzigd eerst. Een assessment dat in beide richtingen gekoppeld is, staat er twee keer in.',
      params: assessmentParams,
      response: { 200: linksResponse },
    },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    return listLinks(assessmentId)
  })

  // Replace the outgoing links of an assessment
  app.put<{
    Params: { assessmentId: string }
    Body: { assessmentIds: string[] }
  }>('/:assessmentId/links', {
    schema: {
      tags: ['assessments'],
      description: 'Vervangt de uitgaande koppelingen van dit assessment door de opgegeven set. Alleen andere assessments uit hetzelfde project zijn toegestaan.',
      params: assessmentParams,
      body: {
        type: 'object',
        required: ['assessmentIds'],
        properties: {
          assessmentIds: {
            type: 'array',
            maxItems: MAX_LINKS,
            uniqueItems: true,
            items: { type: 'string', format: 'uuid' },
          },
        },
        additionalProperties: false,
      },
      response: { 200: linksResponse },
    },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const { assessmentIds } = request.body
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'editor', request.url, reply)
    if (!result) return

    const replaced = !assessmentIds.includes(assessmentId) && await db.transaction(async (tx) => {
      // Two saves of the same assessment's links run one after the other: the
      // second waits here, then replaces what the first wrote (last one wins)
      // instead of colliding on the primary key.
      await tx
        .select({ id: assessmentInstances.id })
        .from(assessmentInstances)
        .where(eq(assessmentInstances.id, assessmentId))
        .for('update')
      // Lock this assessment and every target (KEY SHARE: blocks a concurrent
      // delete, not a save) so none can vanish between this check and the insert.
      // A row is only found when it is in the same project, so a missing one
      // means: unknown id, other project, or deleted in the meantime.
      const found = await tx
        .select({ id: assessmentInstances.id })
        .from(assessmentInstances)
        .where(and(
          inArray(assessmentInstances.id, [assessmentId, ...assessmentIds]),
          eq(assessmentInstances.projectId, result.assessment.projectId),
        ))
        .for('key share')
      if (found.length !== assessmentIds.length + 1) return false

      await tx.delete(assessmentLinks).where(eq(assessmentLinks.fromAssessmentId, assessmentId))
      if (assessmentIds.length > 0) {
        await tx.insert(assessmentLinks).values(
          assessmentIds.map(toAssessmentId => ({ fromAssessmentId: assessmentId, toAssessmentId })),
        )
      }
      return true
    })

    if (!replaced) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Je kunt alleen andere assessments uit hetzelfde project koppelen.',
        instance: request.url,
      })
    }

    return listLinks(assessmentId)
  })
}

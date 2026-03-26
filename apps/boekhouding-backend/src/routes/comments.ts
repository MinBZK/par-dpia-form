import type { FastifyInstance, FastifyReply } from 'fastify'
import { db } from '../db/connection.js'
import { comments, assessmentInstances, projectMembers, users } from '../db/schema.js'
import { eq, and, isNull, gt, asc, inArray } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import type { ProjectRole } from '../middleware/projectAccess.js'
import { computeLastModifiedAt } from '../utils/comments.js'

const roleHierarchy: Record<ProjectRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }
const roleLabels: Record<ProjectRole, string> = { viewer: 'kijker', commenter: 'commentator', editor: 'bewerker', owner: 'eigenaar' }

const commentSelect = {
  id: comments.id,
  fieldId: comments.fieldId,
  parentId: comments.parentId,
  authorId: comments.authorId,
  authorName: users.displayName,
  body: comments.body,
  resolvedAt: comments.resolvedAt,
  resolvedBy: comments.resolvedBy,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
}

async function requireAssessmentAccess(
  assessmentId: string,
  userId: string,
  minimumRole: ProjectRole,
  requestUrl: string,
  reply: FastifyReply,
): Promise<{ assessment: typeof assessmentInstances.$inferSelect; role: ProjectRole } | null> {
  const [assessment] = await db
    .select()
    .from(assessmentInstances)
    .where(eq(assessmentInstances.id, assessmentId))
    .limit(1)

  if (!assessment) {
    reply.status(404).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/404',
      title: 'Niet gevonden',
      status: 404,
      detail: 'Assessment niet gevonden',
      instance: requestUrl,
    })
    return null
  }

  const membership = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, assessment.projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1)

  if (membership.length === 0 || roleHierarchy[membership[0].role] < roleHierarchy[minimumRole]) {
    reply.status(403).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/403',
      title: 'Geen toegang',
      status: 403,
      detail: membership.length === 0 ? 'Geen lid van dit project' : `De rol ${roleLabels[minimumRole]} is vereist`,
      instance: requestUrl,
    })
    return null
  }

  return { assessment, role: membership[0].role }
}

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /assessments/:assessmentId/comments — bulk load, optional ?since=ISO8601
  app.get<{
    Params: { assessmentId: string }
    Querystring: { since?: string }
  }>('/assessments/:assessmentId/comments', {
    schema: { tags: ['comments'] },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const { since } = request.query

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const sinceDate = since ? new Date(since) : null

    // Fetch root comments (no parentId)
    const rootConditions = [
      eq(comments.assessmentInstanceId, assessmentId),
      isNull(comments.parentId),
    ]
    if (sinceDate) {
      rootConditions.push(gt(comments.updatedAt, sinceDate))
    }

    const rootComments = await db
      .select(commentSelect)
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(and(...rootConditions))
      .orderBy(asc(comments.createdAt))

    const resolvedByIds = [...new Set(rootComments.filter(c => c.resolvedBy).map(c => c.resolvedBy!))]
    const resolvedByNames: Record<string, string> = {}
    if (resolvedByIds.length > 0) {
      const resolvedUsers = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, resolvedByIds))
      for (const u of resolvedUsers) resolvedByNames[u.id] = u.displayName
    }

    const rootIds = rootComments.map(c => c.id)
    let allReplies: typeof rootComments = []

    if (rootIds.length > 0) {
      if (sinceDate) {
        const recentReplies = await db
          .select(commentSelect)
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(
            and(
              eq(comments.assessmentInstanceId, assessmentId),
              gt(comments.updatedAt, sinceDate),
            ),
          )
          .orderBy(asc(comments.createdAt))

        // Build resolvedByNames from the actual response data
        const pollResolvedByIds = [...new Set(recentReplies.filter(c => c.resolvedBy).map(c => c.resolvedBy!))]
        const pollResolvedByNames: Record<string, string> = {}
        if (pollResolvedByIds.length > 0) {
          const resolvedUsers = await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, pollResolvedByIds))
          for (const u of resolvedUsers) pollResolvedByNames[u.id] = u.displayName
        }

        const lastModified = recentReplies.length > 0
          ? recentReplies.reduce((max, c) => c.updatedAt > max ? c.updatedAt : max, recentReplies[0].updatedAt)
          : sinceDate

        return {
          comments: recentReplies.map(c => ({
            ...c,
            resolvedByName: c.resolvedBy ? pollResolvedByNames[c.resolvedBy] ?? null : null,
          })),
          lastModifiedAt: lastModified.toISOString(),
          assessmentVersion: result.assessment.currentVersion,
          currentUserId: request.user!.id,
        }
      }

      allReplies = await db
        .select(commentSelect)
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(inArray(comments.parentId, rootIds))
        .orderBy(asc(comments.createdAt))
    }

    // Group replies by parentId
    const repliesByParent = new Map<string, typeof allReplies>()
    for (const reply of allReplies) {
      const list = repliesByParent.get(reply.parentId!) || []
      list.push(reply)
      repliesByParent.set(reply.parentId!, list)
    }

    // Build nested response
    const threaded = rootComments.map(root => ({
      ...root,
      resolvedByName: root.resolvedBy ? resolvedByNames[root.resolvedBy] ?? null : null,
      replies: (repliesByParent.get(root.id) || []).map(r => ({
        id: r.id,
        parentId: r.parentId,
        authorId: r.authorId,
        authorName: r.authorName,
        body: r.body,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    }))

    const lastModifiedAt = computeLastModifiedAt([
      ...rootComments.map(c => c.updatedAt),
      ...allReplies.map(c => c.updatedAt),
    ])

    return {
      comments: threaded,
      lastModifiedAt: lastModifiedAt?.toISOString() ?? null,
      assessmentVersion: result.assessment.currentVersion,
      currentUserId: request.user!.id,
    }
  })

  // POST /assessments/:assessmentId/comments — create comment or reply
  app.post<{
    Params: { assessmentId: string }
    Body: { fieldId: string; body: string; parentId?: string }
  }>('/assessments/:assessmentId/comments', {
    schema: {
      tags: ['comments'],
      body: {
        type: 'object',
        required: ['fieldId', 'body'],
        properties: {
          fieldId: { type: 'string', minLength: 1 },
          body: { type: 'string', minLength: 1, maxLength: 2000 },
          parentId: { type: 'string', format: 'uuid' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const { fieldId, body, parentId } = request.body
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'commenter', request.url, reply)
    if (!result) return

    // If reply, validate parent exists and belongs to this assessment
    if (parentId) {
      const [parent] = await db
        .select({ id: comments.id, parentId: comments.parentId })
        .from(comments)
        .where(
          and(
            eq(comments.id, parentId),
            eq(comments.assessmentInstanceId, assessmentId),
          ),
        )
        .limit(1)

      if (!parent) {
        return reply.status(404).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/404',
          title: 'Niet gevonden',
          status: 404,
          detail: 'Bovenliggend commentaar niet gevonden',
          instance: request.url,
        })
      }

      // Only 1 level of nesting — replies to replies are not allowed
      if (parent.parentId !== null) {
        return reply.status(400).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/400',
          title: 'Ongeldig verzoek',
          status: 400,
          detail: 'Reageren op een reactie is niet toegestaan',
          instance: request.url,
        })
      }
    }

    const [created] = await db
      .insert(comments)
      .values({
        assessmentInstanceId: assessmentId,
        fieldId,
        parentId: parentId ?? null,
        authorId: userId,
        body,
      })
      .returning()

    const [author] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    return reply.status(201).send({
      ...created,
      authorName: author?.displayName ?? '',
    })
  })

  // PATCH /assessments/:assessmentId/comments/:commentId — edit body
  app.patch<{
    Params: { assessmentId: string; commentId: string }
    Body: { body: string }
  }>('/assessments/:assessmentId/comments/:commentId', {
    schema: {
      tags: ['comments'],
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { assessmentId, commentId } = request.params
    const { body } = request.body
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'commenter', request.url, reply)
    if (!result) return

    const [comment] = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.assessmentInstanceId, assessmentId),
        ),
      )
      .limit(1)

    if (!comment) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Commentaar niet gevonden',
        instance: request.url,
      })
    }

    // Only the author can edit their own comment
    if (comment.authorId !== userId) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: 'Alleen de auteur kan dit commentaar bewerken',
        instance: request.url,
      })
    }

    const [updated] = await db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(eq(comments.id, commentId))
      .returning()

    return updated
  })

  // DELETE /assessments/:assessmentId/comments/:commentId
  app.delete<{
    Params: { assessmentId: string; commentId: string }
  }>('/assessments/:assessmentId/comments/:commentId', {
    schema: { tags: ['comments'] },
  }, async (request, reply) => {
    const { assessmentId, commentId } = request.params
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'commenter', request.url, reply)
    if (!result) return

    const [comment] = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.assessmentInstanceId, assessmentId),
        ),
      )
      .limit(1)

    if (!comment) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Commentaar niet gevonden',
        instance: request.url,
      })
    }

    // Author can delete own comment; owner can delete any comment
    if (comment.authorId !== userId && result.role !== 'owner') {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: 'Geen rechten om dit commentaar te verwijderen',
        instance: request.url,
      })
    }

    await db.transaction(async (tx) => {
      if (comment.parentId === null) {
        await tx.delete(comments).where(eq(comments.parentId, commentId))
      }
      await tx.delete(comments).where(eq(comments.id, commentId))
    })
    return reply.status(204).send()
  })

  // POST /assessments/:assessmentId/comments/:commentId/resolve
  app.post<{
    Params: { assessmentId: string; commentId: string }
  }>('/assessments/:assessmentId/comments/:commentId/resolve', {
    schema: { tags: ['comments'] },
  }, async (request, reply) => {
    const { assessmentId, commentId } = request.params
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'editor', request.url, reply)
    if (!result) return

    const [comment] = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.assessmentInstanceId, assessmentId),
          isNull(comments.parentId), // Only root comments can be resolved
        ),
      )
      .limit(1)

    if (!comment) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Commentaar niet gevonden of is een reactie',
        instance: request.url,
      })
    }

    const [updated] = await db
      .update(comments)
      .set({
        resolvedAt: new Date(),
        resolvedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))
      .returning()

    return updated
  })

  // POST /assessments/:assessmentId/comments/:commentId/reopen
  app.post<{
    Params: { assessmentId: string; commentId: string }
  }>('/assessments/:assessmentId/comments/:commentId/reopen', {
    schema: { tags: ['comments'] },
  }, async (request, reply) => {
    const { assessmentId, commentId } = request.params
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'editor', request.url, reply)
    if (!result) return

    const [comment] = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, commentId),
          eq(comments.assessmentInstanceId, assessmentId),
          isNull(comments.parentId),
        ),
      )
      .limit(1)

    if (!comment) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Commentaar niet gevonden of is een reactie',
        instance: request.url,
      })
    }

    const [updated] = await db
      .update(comments)
      .set({
        resolvedAt: null,
        resolvedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))
      .returning()

    return updated
  })
}

import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { comments, users } from '../db/schema.js'
import { eq, and, isNull, gt, asc, inArray } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireAssessmentAccess } from '../middleware/assessmentAccess.js'
import { computeLastModifiedAt } from '../utils/comments.js'

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

export async function commentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /assessments/:assessmentId/comments — bulk load, optional ?since=ISO8601
  app.get<{
    Params: { assessmentId: string }
    Querystring: { since?: string }
  }>('/:assessmentId/comments', {
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

        // rootIds is non-empty only when a root passed the same gt(updatedAt, since)
        // filter that feeds recentReplies, so recentReplies is guaranteed non-empty here.
        const lastModified = recentReplies.reduce(
          (max, c) => c.updatedAt > max ? c.updatedAt : max,
          recentReplies[0].updatedAt,
        )

        return {
          comments: recentReplies.map(c => ({
            ...c,
            // resolvedBy is a FK to users, so the inArray lookup always resolves a (notNull) displayName.
            resolvedByName: c.resolvedBy ? pollResolvedByNames[c.resolvedBy] : null,
          })),
          lastModifiedAt: lastModified.toISOString(),
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
      // resolvedBy is a FK to users, so the inArray lookup always resolves a (notNull) displayName.
      resolvedByName: root.resolvedBy ? resolvedByNames[root.resolvedBy] : null,
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
      currentUserId: request.user!.id,
    }
  })

  // POST /assessments/:assessmentId/comments — create comment or reply
  app.post<{
    Params: { assessmentId: string }
    Body: { fieldId: string; body: string; parentId?: string }
  }>('/:assessmentId/comments', {
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
      // author is request.user (created/synced by requireAuth), so the lookup
      // always returns a row with a notNull displayName.
      authorName: author.displayName,
    })
  })

  // PATCH /assessments/:assessmentId/comments/:commentId — edit body or toggle resolved state
  // Accepts exactly one of `body` or `resolvedAt`:
  //   - `body`: author-only, edits the comment text
  //   - `resolvedAt`: editor+, null reopens the thread, ISO timestamp resolves it
  //     (server always derives `resolvedBy` from the caller; clients cannot set it)
  app.patch<{
    Params: { assessmentId: string; commentId: string }
    Body: { body?: string; resolvedAt?: string | null }
  }>('/:assessmentId/comments/:commentId', {
    schema: {
      tags: ['comments'],
      body: {
        type: 'object',
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 2000 },
          resolvedAt: { type: ['string', 'null'], format: 'date-time' },
        },
        additionalProperties: false,
        oneOf: [
          { required: ['body'] },
          { required: ['resolvedAt'] },
        ],
      },
    },
  }, async (request, reply) => {
    const { assessmentId, commentId } = request.params
    const { body, resolvedAt } = request.body
    const isResolveOperation = resolvedAt !== undefined
    const userId = request.user!.id

    // Resolve/reopen requires editor, edit body requires commenter
    const requiredRole = isResolveOperation ? 'editor' : 'commenter'
    const result = await requireAssessmentAccess(assessmentId, userId, requiredRole, request.url, reply)
    if (!result) return

    // Root comments only when toggling resolved state
    const whereClause = isResolveOperation
      ? and(
        eq(comments.id, commentId),
        eq(comments.assessmentInstanceId, assessmentId),
        isNull(comments.parentId),
      )
      : and(
        eq(comments.id, commentId),
        eq(comments.assessmentInstanceId, assessmentId),
      )

    const [comment] = await db
      .select()
      .from(comments)
      .where(whereClause)
      .limit(1)

    if (!comment) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: isResolveOperation
          ? 'Commentaar niet gevonden of is een reactie'
          : 'Commentaar niet gevonden',
        instance: request.url,
      })
    }

    if (isResolveOperation) {
      const resolving = resolvedAt !== null
      const [updated] = await db
        .update(comments)
        .set({
          resolvedAt: resolving ? new Date(resolvedAt as string) : null,
          resolvedBy: resolving ? userId : null,
          updatedAt: new Date(),
        })
        .where(eq(comments.id, commentId))
        .returning()

      return updated
    }

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
      .set({ body: body as string, updatedAt: new Date() })
      .where(eq(comments.id, commentId))
      .returning()

    return updated
  })

  // DELETE /assessments/:assessmentId/comments/:commentId
  app.delete<{
    Params: { assessmentId: string; commentId: string }
  }>('/:assessmentId/comments/:commentId', {
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

}

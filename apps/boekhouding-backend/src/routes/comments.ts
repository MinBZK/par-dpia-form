import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { comments, users } from '../db/schema.js'
import { eq, and, isNull, gt, asc, inArray } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireAssessmentAccess } from '../middleware/assessmentAccess.js'
import { computeLastModifiedAt } from '../utils/comments.js'
import { assessmentParams, commentParams, sinceQuerySchema, dutchSchemaErrorFormatter } from '../utils/routeSchemas.js'

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

// Generous hard cap so a comment list (or a wide ?since delta) can never be
// pulled unbounded in a single query. Well above any realistic per-assessment
// thread count; the sync endpoint's commentCount lets clients detect a cap hit.
const COMMENTS_MAX = 1000

type CommentRow = {
  id: string
  parentId: string | null
  authorId: string
  authorName: string
  body: string
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
}

async function resolvedByNames(rows: CommentRow[]): Promise<Record<string, string>> {
  const ids = [...new Set(rows.filter(r => r.resolvedBy).map(r => r.resolvedBy!))]
  if (ids.length === 0) return {}

  const rowsByUser = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids))
  return Object.fromEntries(rowsByUser.map(u => [u.id, u.displayName]))
}

function groupRepliesByParent(replies: CommentRow[]) {
  const byParent = new Map<string, Array<Omit<CommentRow, 'resolvedBy'>>>()
  for (const r of replies) {
    const list = byParent.get(r.parentId!) || []
    list.push({
      id: r.id,
      parentId: r.parentId,
      authorId: r.authorId,
      authorName: r.authorName,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })
    byParent.set(r.parentId!, list)
  }
  return byParent
}

export async function commentRoutes(app: FastifyInstance) {
  app.setSchemaErrorFormatter(dutchSchemaErrorFormatter)

  app.addHook('preHandler', requireAuth)

  // GET /assessments/:assessmentId/comments — bulk load, optional ?since=ISO8601
  app.get<{
    Params: { assessmentId: string }
    Querystring: { since?: string }
  }>('/:assessmentId/comments', {
    schema: { tags: ['comments'], params: assessmentParams, querystring: sinceQuerySchema },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const { since } = request.query

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const sinceDate = since ? new Date(since) : null

    // Incremental poll: every comment touched since the watermark, flat — roots and replies
    // alike, so a changed reply reaches the client even when its root did not move.
    if (sinceDate) {
      const changed = await db
        .select(commentSelect)
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(
          and(
            eq(comments.assessmentInstanceId, assessmentId),
            gt(comments.updatedAt, sinceDate),
          ),
        )
        // Ordered by updatedAt so the cap truncates the tail: the watermark below is the
        // largest updatedAt delivered, and everything cut off sits above it and arrives on
        // the next poll. Ordering by createdAt would strand those changes for good.
        .orderBy(asc(comments.updatedAt), asc(comments.id))
        .limit(COMMENTS_MAX)

      // A root the client has not seen before must arrive with its full reply list, or the
      // client stores the thread empty and its comment count drifts from the server's.
      const changedRootIds = changed.filter(c => c.parentId === null).map(c => c.id)
      const rootReplies = changedRootIds.length > 0
        ? await db
          .select(commentSelect)
          .from(comments)
          .innerJoin(users, eq(comments.authorId, users.id))
          .where(inArray(comments.parentId, changedRootIds))
          .orderBy(asc(comments.createdAt))
          .limit(COMMENTS_MAX)
        : []

      const repliesByParent = groupRepliesByParent(rootReplies)
      const names = await resolvedByNames(changed)

      return {
        comments: changed.map((c) => {
          const entry = { ...c, resolvedByName: c.resolvedBy ? names[c.resolvedBy] : null }
          if (c.parentId !== null) return entry
          return { ...entry, replies: repliesByParent.get(c.id) || [] }
        }),
        // Echo the watermark when nothing changed — dropping it sends the client back to a
        // full list on its next poll.
        lastModifiedAt: computeLastModifiedAt(changed.map(c => c.updatedAt))?.toISOString()
          ?? sinceDate.toISOString(),
        currentUserId: request.user!.id,
      }
    }

    const rootComments = await db
      .select(commentSelect)
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(
        and(
          eq(comments.assessmentInstanceId, assessmentId),
          isNull(comments.parentId),
        ),
      )
      .orderBy(asc(comments.createdAt))
      .limit(COMMENTS_MAX)

    const names = await resolvedByNames(rootComments)
    const rootIds = rootComments.map(c => c.id)

    const allReplies = rootIds.length > 0
      ? await db
        .select(commentSelect)
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(inArray(comments.parentId, rootIds))
        .orderBy(asc(comments.createdAt))
        .limit(COMMENTS_MAX)
      : []

    const repliesByParent = groupRepliesByParent(allReplies)

    const threaded = rootComments.map(root => ({
      ...root,
      resolvedByName: root.resolvedBy ? names[root.resolvedBy] : null,
      replies: repliesByParent.get(root.id) || [],
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
      params: assessmentParams,
      body: {
        type: 'object',
        required: ['fieldId', 'body'],
        properties: {
          // A URN field id ('urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0') stays
          // well under this; the cap keeps a text column from being used as storage.
          fieldId: { type: 'string', minLength: 1, maxLength: 255 },
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
      authorName: author.displayName,
    })
  })

  // PATCH /assessments/:assessmentId/comments/:commentId — edit body or toggle resolved state
  // Accepts exactly one of `body` or `resolvedAt`:
  //   - `body`: author-only, edits the comment text
  //   - `resolvedAt`: editor+, null reopens the thread, any timestamp resolves it
  //     (server derives both `resolvedBy` and the stored timestamp from the request;
  //     a value sent by the client is accepted for compatibility but ignored)
  app.patch<{
    Params: { assessmentId: string; commentId: string }
    Body: { body?: string; resolvedAt?: string | null }
  }>('/:assessmentId/comments/:commentId', {
    schema: {
      tags: ['comments'],
      params: commentParams,
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
          resolvedAt: resolving ? new Date() : null,
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
    schema: { tags: ['comments'], params: commentParams },
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

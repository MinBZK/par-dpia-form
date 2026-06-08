import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, assessmentVersions, comments, projectMembers } from '../db/schema.js'
import { eq, and, count } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'

/**
 * Sync endpoint — exposes collaboration signals for polling clients. Separate from /comments to keep concerns isolated.
 *
 * Returns only the minimum data needed for clients to decide whether to refresh: the current version, last update
 * timestamp, and whether the latest change was made by the requesting user.
 *
 * Does NOT expose user UUIDs (AVG dataminimalisatie).
 *
 * Performance: fires two independent queries in parallel (Promise.all) — one join query for auth + sync data,
 * one count query for comments. This avoids sequential round-trips per poll.
 */
export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // GET /assessments/:assessmentId/sync — lightweight sync signal for polling
  app.get<{
    Params: { assessmentId: string }
  }>('/:assessmentId/sync', {
    schema: {
      tags: ['sync'],
      description: 'Lightweight collaboration sync signal. Returns the current assessment version, last update timestamp, and whether the last change was made by the requesting user. Used by clients to decide whether to fetch updated state.',
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'integer' },
            updatedAt: { type: 'string', format: 'date-time' },
            lastModifiedBySelf: { type: 'boolean' },
            commentCount: { type: 'integer' },
          },
          required: ['version', 'updatedAt', 'lastModifiedBySelf', 'commentCount'],
        },
      },
    },
  }, async (request, reply) => {
    const { assessmentId } = request.params
    const userId = request.user!.id

    // The row/access query and the comment count are independent — run them in
    // parallel so a poll costs one round-trip, not two. Guards apply after both resolve.
    const [rowResult, countResult] = await Promise.all([
      db
        .select({
          currentVersion: assessmentInstances.currentVersion,
          updatedAt: assessmentInstances.updatedAt,
          projectId: assessmentInstances.projectId,
          memberRole: projectMembers.role,
          latestVersionCreatedBy: assessmentVersions.createdBy,
        })
        .from(assessmentInstances)
        .leftJoin(
          assessmentVersions,
          and(
            eq(assessmentVersions.assessmentInstanceId, assessmentInstances.id),
            eq(assessmentVersions.version, assessmentInstances.currentVersion),
          ),
        )
        .leftJoin(
          projectMembers,
          and(
            eq(projectMembers.projectId, assessmentInstances.projectId),
            eq(projectMembers.userId, userId),
          ),
        )
        .where(eq(assessmentInstances.id, assessmentId))
        .limit(1),
      db
        .select({ total: count() })
        .from(comments)
        .where(eq(comments.assessmentInstanceId, assessmentId)),
    ])

    const [row] = rowResult
    const [{ total }] = countResult

    if (!row) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Assessment niet gevonden',
        instance: request.url,
      })
    }

    if (!row.memberRole) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: 'Je hebt geen toegang tot deze assessment',
        instance: request.url,
      })
    }

    return {
      version: row.currentVersion,
      updatedAt: row.updatedAt.toISOString(),
      lastModifiedBySelf: row.latestVersionCreatedBy === userId,
      commentCount: total,
    }
  })
}

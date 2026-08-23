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
 * Performance: one join query combines the auth check (project_members) with the sync data (assessment_instances +
 * assessment_versions), and runs in parallel with the comment count. One round-trip per poll instead of three.
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

    // Two independent queries, run in parallel so a poll costs one round-trip.
    // - row: assessment lookup + project membership + latest version author.
    //   LEFT JOIN project_members yields a null role when the user has no access
    //   → the 403/404 decision below.
    // - count: see commentCount below.
    // The count therefore runs before access is decided. It returns nothing to a
    // non-member (both guards below still gate the response) and only ever costs
    // one indexed COUNT, bounded by the global rate limit.
    const [rows, counts] = await Promise.all([
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
      // Comment count lets clients detect deletions — when a comment is removed, the
      // /comments?since=... poll returns nothing about it (there's no row left to match).
      // A mismatch between server count and local thread+reply count triggers a full refresh.
      db
        .select({ total: count() })
        .from(comments)
        .where(eq(comments.assessmentInstanceId, assessmentId)),
    ])

    const [row] = rows

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

    const [{ total }] = counts

    return {
      version: row.currentVersion,
      updatedAt: row.updatedAt.toISOString(),
      lastModifiedBySelf: row.latestVersionCreatedBy === userId,
      commentCount: total,
    }
  })
}

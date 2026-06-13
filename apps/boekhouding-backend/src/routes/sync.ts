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
 * Performance: uses a single query combining auth check (project_members) and sync data (assessment_instances +
 * assessment_versions) via joins. This avoids 3 sequential round-trips per poll.
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

    // Single query: combines assessment lookup, project membership check, and latest version author.
    // - INNER JOIN project_members: fails (no rows) if user has no access → 403/404 decision below
    // - LEFT JOIN assessment_versions on currentVersion: latest version row (nullable for edge cases)
    const [row] = await db
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
      .limit(1)

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

    // Comment count lets clients detect deletions — when a comment is removed, the
    // /comments?since=... poll returns nothing about it (there's no row left to match).
    // A mismatch between server count and local thread+reply count triggers a full refresh.
    const [{ total }] = await db
      .select({ total: count() })
      .from(comments)
      .where(eq(comments.assessmentInstanceId, assessmentId))

    return {
      version: row.currentVersion,
      updatedAt: row.updatedAt.toISOString(),
      lastModifiedBySelf: row.latestVersionCreatedBy === userId,
      commentCount: total,
    }
  })
}

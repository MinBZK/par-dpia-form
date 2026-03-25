import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/connection.js'
import { projectMembers } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

export type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer'

declare module 'fastify' {
  interface FastifyRequest {
    projectRole?: ProjectRole
  }
}

export function requireProjectAccess(minimumRole: ProjectRole = 'viewer') {
  const roleHierarchy: Record<ProjectRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }
  const roleLabels: Record<ProjectRole, string> = { viewer: 'kijker', commenter: 'commentator', editor: 'bewerker', owner: 'eigenaar' }

  return async function (request: FastifyRequest, reply: FastifyReply) {
    const projectId = (request.params as { projectId?: string }).projectId
    if (!projectId) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Project-ID is verplicht',
        instance: request.url,
      })
    }

    if (!request.user) {
      return reply.status(401).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/401',
        title: 'Niet geauthenticeerd',
        status: 401,
        detail: 'Niet ingelogd',
        instance: request.url,
      })
    }

    const membership = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, request.user.id),
        ),
      )
      .limit(1)

    if (membership.length === 0) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: 'Geen lid van dit project',
        instance: request.url,
      })
    }

    const userRole = membership[0].role
    if (roleHierarchy[userRole] < roleHierarchy[minimumRole]) {
      return reply.status(403).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/403',
        title: 'Geen toegang',
        status: 403,
        detail: `De rol ${roleLabels[minimumRole]} is vereist`,
        instance: request.url,
      })
    }

    request.projectRole = userRole
  }
}

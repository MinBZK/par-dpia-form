import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { projectMembers, users } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectAccess, type ProjectRole } from '../middleware/projectAccess.js'

export async function memberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // List members of a project
  app.get<{
    Params: { projectId: string }
  }>('/:projectId/members', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params

    const members = await db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        role: projectMembers.role,
        invitedAt: projectMembers.invitedAt,
        acceptedAt: projectMembers.acceptedAt,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId))

    return members
  })

  // Add member by email — creates placeholder account if user doesn't exist
  app.post<{
    Params: { projectId: string }
    Body: { email: string; role?: ProjectRole }
  }>('/:projectId/members', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('owner')],
  }, async (request, reply) => {
    const { projectId } = request.params
    const { email, role } = request.body

    if (!email) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'E-mailadres is verplicht',
        instance: request.url,
      })
    }

    const normalizedEmail = email.toLowerCase()

    // Find or create user by email
    let [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)

    if (!user) {
      // Create placeholder account — activates on first Keycloak login
      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          displayName: normalizedEmail, // Use email as display name until they register
        })
        .returning({ id: users.id })
      user = newUser
    }

    // Check if already a member
    const existing = await db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, user.id),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return reply.status(409).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/409',
        title: 'Conflict',
        status: 409,
        detail: 'Dit e-mailadres is al toegevoegd',
        instance: request.url,
      })
    }

    const validRoles: ProjectRole[] = ['owner', 'editor', 'viewer']
    const memberRole = role || 'editor'
    if (!validRoles.includes(memberRole)) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: `Ongeldige rol: ${role}. Geldige rollen: ${validRoles.join(', ')}`,
        instance: request.url,
      })
    }
    await db
      .insert(projectMembers)
      .values({
        projectId,
        userId: user.id,
        role: memberRole,
      })

    return reply.status(201).send({ userId: user.id, role: memberRole })
  })

  // Update member role
  app.put<{
    Params: { projectId: string; userId: string }
    Body: { role: ProjectRole }
  }>('/:projectId/members/:userId', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('owner')],
  }, async (request, reply) => {
    const { projectId, userId } = request.params
    const { role } = request.body

    if (!role) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Rol is verplicht',
        instance: request.url,
      })
    }

    // If changing away from owner, ensure at least one owner remains
    const [currentMembership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1)

    if (!currentMembership) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Lid niet gevonden',
        instance: request.url,
      })
    }

    if (currentMembership.role === 'owner' && role !== 'owner') {
      const owners = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.role, 'owner'),
          ),
        )

      if (owners.length <= 1) {
        return reply.status(400).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/400',
          title: 'Ongeldig verzoek',
          status: 400,
          detail: 'Er moet minimaal één eigenaar zijn',
          instance: request.url,
        })
      }
    }

    const [updated] = await db
      .update(projectMembers)
      .set({ role })
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .returning()

    return updated
  })

  // Remove member
  app.delete<{
    Params: { projectId: string; userId: string }
  }>('/:projectId/members/:userId', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('owner')],
  }, async (request, reply) => {
    const { projectId, userId } = request.params

    // Check if user is an owner — if so, ensure at least one owner remains
    const [membership] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1)

    if (!membership) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Lid niet gevonden',
        instance: request.url,
      })
    }

    if (membership.role === 'owner') {
      const owners = await db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.role, 'owner'),
          ),
        )

      if (owners.length <= 1) {
        return reply.status(400).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/400',
          title: 'Ongeldig verzoek',
          status: 400,
          detail: 'Er moet minimaal één eigenaar zijn',
          instance: request.url,
        })
      }
    }

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )

    return reply.status(204).send()
  })
}

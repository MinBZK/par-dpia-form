import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { projects, projectMembers, assessmentInstances, assessmentVersions, assessmentEdits } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/projectAccess.js'

export async function projectRoutes(app: FastifyInstance) {
  // All project routes require auth
  app.addHook('preHandler', requireAuth)

  // List projects for the current user
  app.get('/', { schema: { tags: ['projects'] } }, async (request) => {
    const userId = request.user!.id

    const result = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, userId))

    return result
  })

  // Create project
  app.post<{
    Body: { name: string; description?: string }
  }>('/', {
    schema: {
      tags: ['projects'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string', maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name, description } = request.body
    const userId = request.user!.id

    const [project] = await db
      .insert(projects)
      .values({ name, description: description || '', createdBy: userId })
      .returning()

    // Creator becomes owner
    await db
      .insert(projectMembers)
      .values({ projectId: project.id, userId, role: 'owner', acceptedAt: new Date() })

    return reply.status(201).send(project)
  })

  // Get project by ID
  app.get<{
    Params: { projectId: string }
  }>('/:projectId', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId } = request.params

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (!project) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Project niet gevonden',
        instance: request.url,
      })
    }

    return { ...project, role: request.projectRole }
  })

  // Update project
  app.put<{
    Params: { projectId: string }
    Body: { name?: string; description?: string }
  }>('/:projectId', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('owner')],
  }, async (request) => {
    const { projectId } = request.params
    const { name, description } = request.body

    const [updated] = await db
      .update(projects)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning()

    return updated
  })

  // Delete project
  app.delete<{
    Params: { projectId: string }
  }>('/:projectId', {
    schema: { tags: ['projects'] },
    preHandler: [requireProjectAccess('owner')],
  }, async (request, reply) => {
    const { projectId } = request.params

    await db.delete(projects).where(eq(projects.id, projectId))

    return reply.status(204).send()
  })

  app.get<{
    Params: { projectId: string }
  }>('/:projectId/assessments', {
    schema: { tags: ['assessments'] },
    preHandler: [requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params

    const assessments = await db
      .select()
      .from(assessmentInstances)
      .where(eq(assessmentInstances.projectId, projectId))

    return assessments
  })

  app.post<{
    Params: { projectId: string }
    Body: { name?: string; assessmentType: 'dpia' | 'prescan' | 'iama'; state?: unknown }
  }>('/:projectId/assessments', {
    schema: {
      tags: ['assessments'],
      body: {
        type: 'object',
        required: ['assessmentType'],
        properties: {
          assessmentType: { type: 'string', enum: ['dpia', 'prescan', 'iama'] },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          state: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
    preHandler: [requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { projectId } = request.params
    const { name, assessmentType, state } = request.body
    const userId = request.user!.id

    let finalName = name
    if (!finalName) {
      const baseLabel = assessmentType === 'dpia' ? 'DPIA' : assessmentType === 'iama' ? 'IAMA' : 'Pre-scan DPIA'
      const existing = await db
        .select()
        .from(assessmentInstances)
        .where(
          and(
            eq(assessmentInstances.projectId, projectId),
            eq(assessmentInstances.assessmentType, assessmentType),
          ),
        )
      finalName = existing.length === 0 ? baseLabel : `${baseLabel} ${existing.length + 1}`
    }

    const initialState = state || {}

    const [assessment] = await db
      .insert(assessmentInstances)
      .values({ projectId, name: finalName, assessmentType, createdBy: userId, cachedState: initialState })
      .returning()

    // Create initial version checkpoint
    const [initialVersion] = await db.insert(assessmentVersions).values({
      assessmentInstanceId: assessment.id,
      version: 1,
      createdBy: userId,
    }).returning()

    // Record initial_state edit so state can be rebuilt from edits alone
    await db.insert(assessmentEdits).values({
      assessmentVersionId: initialVersion.id,
      fieldId: '__initial__',
      editType: 'initial_state',
      oldValue: null,
      newValue: initialState,
      editedBy: userId,
    })

    return reply.status(201).send(assessment)
  })
}

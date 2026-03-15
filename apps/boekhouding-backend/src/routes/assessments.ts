import type { FastifyInstance, FastifyReply } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, assessmentVersions, assessmentEdits, projectMembers, users } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/projectAccess.js'
import type { ProjectRole } from '../middleware/projectAccess.js'

const roleHierarchy: Record<ProjectRole, number> = { viewer: 0, editor: 1, owner: 2 }
const roleLabels: Record<ProjectRole, string> = { viewer: 'kijker', editor: 'bewerker', owner: 'eigenaar' }

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

export async function assessmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // List assessments for a project
  app.get<{
    Params: { projectId: string }
  }>('/projects/:projectId/assessments', {
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

  // Create a new assessment instance
  app.post<{
    Params: { projectId: string }
    Body: { name?: string; assessmentType: 'dpia' | 'prescan'; snapshot?: unknown }
  }>('/projects/:projectId/assessments', {
    schema: {
      tags: ['assessments'],
      body: {
        type: 'object',
        required: ['assessmentType'],
        properties: {
          assessmentType: { type: 'string', enum: ['dpia', 'prescan'] },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          snapshot: { type: 'object' },
        },
        additionalProperties: false,
      },
    },
    preHandler: [requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { projectId } = request.params
    const { name, assessmentType, snapshot } = request.body
    const userId = request.user!.id

    // Auto-generate name if not provided
    let finalName = name
    if (!finalName) {
      const baseLabel = assessmentType === 'dpia' ? 'DPIA' : 'Pre-scan DPIA'
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

    const [assessment] = await db
      .insert(assessmentInstances)
      .values({ projectId, name: finalName, assessmentType, createdBy: userId })
      .returning()

    // Create initial version
    await db.insert(assessmentVersions).values({
      assessmentInstanceId: assessment.id,
      version: 1,
      snapshot: snapshot || {},
      savedBy: userId,
    })

    return reply.status(201).send(assessment)
  })

  // Get an assessment instance
  app.get<{
    Params: { assessmentId: string }
  }>('/assessments/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    // Get latest version snapshot
    const [latestVersion] = await db
      .select()
      .from(assessmentVersions)
      .where(eq(assessmentVersions.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentVersions.version))
      .limit(1)

    return { ...result.assessment, role: result.role, snapshot: latestVersion?.snapshot || null }
  })

  // Update assessment (save new version)
  app.put<{
    Params: { assessmentId: string }
    Body: { snapshot?: unknown; changeDescription?: string; name?: string }
  }>('/assessments/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const { snapshot, changeDescription, name } = request.body
    const userId = request.user!.id

    const result = await requireAssessmentAccess(assessmentId, userId, 'editor', request.url, reply)
    if (!result) return
    const { assessment } = result

    // Name-only update (no new version needed)
    if (name && !snapshot) {
      const [updated] = await db
        .update(assessmentInstances)
        .set({ name, updatedAt: new Date() })
        .where(eq(assessmentInstances.id, assessmentId))
        .returning()
      return updated
    }

    if (!snapshot) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Gegevens of naam is verplicht',
        instance: request.url,
      })
    }

    // Get previous snapshot for comparison
    const [previousVersion] = await db
      .select({ snapshot: assessmentVersions.snapshot })
      .from(assessmentVersions)
      .where(
        and(
          eq(assessmentVersions.assessmentInstanceId, assessmentId),
          eq(assessmentVersions.version, assessment.currentVersion),
        ),
      )
      .limit(1)

    // Skip saving if snapshot is identical to current version
    const edits = previousVersion
      ? diffSnapshots(previousVersion.snapshot, snapshot, assessmentId, userId)
      : []

    // No answer changes: update current version's snapshot in place (saves taskState like
    // navigation position and completed sections without creating a new version)
    if (previousVersion && edits.length === 0 && !changeDescription) {
      await db
        .update(assessmentVersions)
        .set({ snapshot })
        .where(
          and(
            eq(assessmentVersions.assessmentInstanceId, assessmentId),
            eq(assessmentVersions.version, assessment.currentVersion),
          ),
        )
      return assessment
    }

    const newVersion = assessment.currentVersion + 1

    // Log field-level changes
    if (edits.length > 0) {
      await db.insert(assessmentEdits).values(edits)
    }

    // Save new version
    await db.insert(assessmentVersions).values({
      assessmentInstanceId: assessmentId,
      version: newVersion,
      snapshot,
      savedBy: userId,
      changeDescription,
    })

    // Update assessment instance (include name if provided)
    const updateData: Record<string, unknown> = { currentVersion: newVersion, updatedAt: new Date() }
    if (name) updateData.name = name

    const [updated] = await db
      .update(assessmentInstances)
      .set(updateData)
      .where(eq(assessmentInstances.id, assessmentId))
      .returning()

    return updated
  })

  // Delete assessment
  app.delete<{
    Params: { assessmentId: string }
  }>('/assessments/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'owner', request.url, reply)
    if (!result) return

    await db.delete(assessmentInstances).where(eq(assessmentInstances.id, assessmentId))
    return reply.status(204).send()
  })

  // Get version history
  app.get<{
    Params: { assessmentId: string }
  }>('/assessments/:assessmentId/versions', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const versions = await db
      .select({
        id: assessmentVersions.id,
        version: assessmentVersions.version,
        savedBy: assessmentVersions.savedBy,
        savedByName: users.displayName,
        savedAt: assessmentVersions.savedAt,
        changeDescription: assessmentVersions.changeDescription,
      })
      .from(assessmentVersions)
      .innerJoin(users, eq(assessmentVersions.savedBy, users.id))
      .where(eq(assessmentVersions.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentVersions.version))

    return versions
  })

  // Get specific version
  app.get<{
    Params: { assessmentId: string; version: string }
  }>('/assessments/:assessmentId/versions/:version', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId, version } = request.params
    const versionNum = parseInt(version, 10)

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const [versionData] = await db
      .select()
      .from(assessmentVersions)
      .where(
        and(
          eq(assessmentVersions.assessmentInstanceId, assessmentId),
          eq(assessmentVersions.version, versionNum),
        ),
      )
      .limit(1)

    if (!versionData) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Versie niet gevonden',
        instance: request.url,
      })
    }

    return versionData
  })

  // Update version description
  app.patch<{
    Params: { assessmentId: string; version: string }
    Body: { changeDescription: string }
  }>('/assessments/:assessmentId/versions/:version', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId, version } = request.params
    const { changeDescription } = request.body
    const versionNum = parseInt(version, 10)

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'editor', request.url, reply)
    if (!result) return

    const [updated] = await db
      .update(assessmentVersions)
      .set({ changeDescription: changeDescription || null })
      .where(
        and(
          eq(assessmentVersions.assessmentInstanceId, assessmentId),
          eq(assessmentVersions.version, versionNum),
        ),
      )
      .returning()

    if (!updated) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Versie niet gevonden',
        instance: request.url,
      })
    }

    return updated
  })

  // Get edit audit log
  app.get<{
    Params: { assessmentId: string }
  }>('/assessments/:assessmentId/edits', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const edits = await db
      .select()
      .from(assessmentEdits)
      .where(eq(assessmentEdits.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentEdits.editedAt))

    return edits
  })
}

/**
 * Compares two snapshots and produces field-level edit records.
 * Compares answer changes and completed section changes.
 */
function diffSnapshots(
  oldSnapshot: unknown,
  newSnapshot: unknown,
  assessmentInstanceId: string,
  userId: string,
): Array<{
  assessmentInstanceId: string
  fieldId: string
  userId: string
  oldValue: unknown
  newValue: unknown
}> {
  const edits: Array<{
    assessmentInstanceId: string
    fieldId: string
    userId: string
    oldValue: unknown
    newValue: unknown
  }> = []

  const oldAnswers = (oldSnapshot as any)?.answers || {}
  const newAnswers = (newSnapshot as any)?.answers || {}

  // Compare answers across namespaces
  const allNamespaces = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const ns of allNamespaces) {
    const oldNs = oldAnswers[ns] || {}
    const newNs = newAnswers[ns] || {}
    const allKeys = new Set([...Object.keys(oldNs), ...Object.keys(newNs)])

    for (const key of allKeys) {
      const oldVal = oldNs[key]
      const newVal = newNs[key]

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        edits.push({
          assessmentInstanceId,
          fieldId: `${ns}.${key}`,
          userId,
          oldValue: oldVal ?? null,
          newValue: newVal ?? null,
        })
      }
    }
  }

  // Compare completed sections across namespaces
  const oldTaskState = (oldSnapshot as any)?.taskState || {}
  const newTaskState = (newSnapshot as any)?.taskState || {}
  const taskNamespaces = new Set([...Object.keys(oldTaskState), ...Object.keys(newTaskState)])

  for (const ns of taskNamespaces) {
    const oldCompleted = new Set<string>(oldTaskState[ns]?.completedRootTaskIds || [])
    const newCompleted = new Set<string>(newTaskState[ns]?.completedRootTaskIds || [])

    for (const id of newCompleted) {
      if (!oldCompleted.has(id)) {
        edits.push({
          assessmentInstanceId,
          fieldId: `${ns}.completed.${id}`,
          userId,
          oldValue: false,
          newValue: true,
        })
      }
    }
    for (const id of oldCompleted) {
      if (!newCompleted.has(id)) {
        edits.push({
          assessmentInstanceId,
          fieldId: `${ns}.completed.${id}`,
          userId,
          oldValue: true,
          newValue: false,
        })
      }
    }
  }

  return edits
}

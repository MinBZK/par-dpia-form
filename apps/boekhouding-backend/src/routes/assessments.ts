import type { FastifyInstance, FastifyReply } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, assessmentVersions, assessmentEdits, projectMembers, users } from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireProjectAccess } from '../middleware/projectAccess.js'
import type { ProjectRole } from '../middleware/projectAccess.js'
import { diffStates } from '../utils/diffStates.js'
import { rebuildState } from '../utils/rebuildState.js'

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
    Body: { name?: string; assessmentType: 'dpia' | 'prescan'; state?: unknown }
  }>('/projects/:projectId/assessments', {
    schema: {
      tags: ['assessments'],
      body: {
        type: 'object',
        required: ['assessmentType'],
        properties: {
          assessmentType: { type: 'string', enum: ['dpia', 'prescan'] },
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

  // Get an assessment instance
  app.get<{
    Params: { assessmentId: string }
  }>('/assessments/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    return { ...result.assessment, role: result.role, state: result.assessment.cachedState || null }
  })

  // Update assessment (save state)
  app.put<{
    Params: { assessmentId: string }
    Body: { state?: unknown; changeDescription?: string; name?: string; expectedVersion?: number; newVersion?: boolean }
  }>('/assessments/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const { state, changeDescription, name, expectedVersion, newVersion: forceNewVersion } = request.body
    const userId = request.user!.id

    // Restore actions (newVersion + changeDescription) require owner role
    const isRestore = forceNewVersion && changeDescription
    const minimumRole = isRestore ? 'owner' as const : 'editor' as const
    const result = await requireAssessmentAccess(assessmentId, userId, minimumRole, request.url, reply)
    if (!result) return
    const { assessment } = result

    // Name-only update (no version needed)
    if (name && !state) {
      const [updated] = await db
        .update(assessmentInstances)
        .set({ name, updatedAt: new Date() })
        .where(eq(assessmentInstances.id, assessmentId))
        .returning()
      return updated
    }

    if (!state) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Gegevens of naam is verplicht',
        instance: request.url,
      })
    }

    // Optimistic locking — expectedVersion is required for state saves.
    // This check MUST run before anything else to prevent stale saves.
    if (expectedVersion === undefined) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'expectedVersion is verplicht bij het opslaan van gegevens',
        instance: request.url,
      })
    }
    if (assessment.currentVersion !== expectedVersion) {
      return reply.status(409).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/409',
        title: 'Conflict',
        status: 409,
        detail: 'Assessment is gewijzigd door een andere gebruiker',
        instance: request.url,
        currentVersion: assessment.currentVersion,
      })
    }

    // Diff against cachedState (no extra query needed)
    const previousState = assessment.cachedState
    const edits = previousState
      ? diffStates(previousState, state, userId)
      : []

    // No content changes: update cachedState only (saves UI-state like
    // navigation position without creating a new version)
    if (previousState && edits.length === 0 && !changeDescription) {
      await db
        .update(assessmentInstances)
        .set({ cachedState: state, updatedAt: new Date() })
        .where(eq(assessmentInstances.id, assessmentId))
      return assessment
    }

    // Check if we can consolidate into the latest version (same user, < 15 min, no special flags)
    const CONSOLIDATION_WINDOW_MS = 15 * 60 * 1000
    const [lastVersion] = await db
      .select()
      .from(assessmentVersions)
      .where(eq(assessmentVersions.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentVersions.version))
      .limit(1)

    const canConsolidate = lastVersion
      && lastVersion.version !== 1
      && lastVersion.createdBy === userId
      && !forceNewVersion
      && !changeDescription
      && (Date.now() - lastVersion.createdAt.getTime()) < CONSOLIDATION_WINDOW_MS

    if (canConsolidate) {
      // Consolidate: add edits to existing version, update timestamps
      if (edits.length > 0) {
        await db.insert(assessmentEdits).values(
          edits.map(edit => ({ ...edit, assessmentVersionId: lastVersion.id })),
        )
      }

      await db
        .update(assessmentVersions)
        .set({ updatedAt: new Date() })
        .where(eq(assessmentVersions.id, lastVersion.id))

      const updateData: Record<string, unknown> = {
        cachedState: state,
        updatedAt: new Date(),
      }
      if (name) updateData.name = name

      const [updated] = await db
        .update(assessmentInstances)
        .set(updateData)
        .where(eq(assessmentInstances.id, assessmentId))
        .returning()

      return updated
    }

    // New version
    const nextVersion = assessment.currentVersion + 1

    const [versionRow] = await db.insert(assessmentVersions).values({
      assessmentInstanceId: assessmentId,
      version: nextVersion,
      createdBy: userId,
      changeDescription,
    }).returning()

    // Log field-level changes linked to the new version
    if (edits.length > 0) {
      await db.insert(assessmentEdits).values(
        edits.map(edit => ({ ...edit, assessmentVersionId: versionRow.id })),
      )
    }

    // Update assessment instance: cachedState + currentVersion
    const updateData: Record<string, unknown> = {
      currentVersion: nextVersion,
      cachedState: state,
      updatedAt: new Date(),
    }
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
        createdBy: assessmentVersions.createdBy,
        createdByName: users.displayName,
        createdAt: assessmentVersions.createdAt,
        updatedAt: assessmentVersions.updatedAt,
        changeDescription: assessmentVersions.changeDescription,
      })
      .from(assessmentVersions)
      .innerJoin(users, eq(assessmentVersions.createdBy, users.id))
      .where(eq(assessmentVersions.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentVersions.version))

    return versions
  })

  // Get specific version
  app.get<{
    Params: { assessmentId: string; version: string }
    Querystring: { includeState?: string }
  }>('/assessments/:assessmentId/versions/:version', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId, version } = request.params
    const versionNum = parseInt(version, 10)
    const includeState = request.query.includeState === 'true'

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const [versionData] = await db
      .select({
        id: assessmentVersions.id,
        version: assessmentVersions.version,
        createdBy: assessmentVersions.createdBy,
        createdAt: assessmentVersions.createdAt,
        updatedAt: assessmentVersions.updatedAt,
        changeDescription: assessmentVersions.changeDescription,
      })
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

    if (includeState) {
      const state = await rebuildState(assessmentId, versionNum)
      return { ...versionData, state }
    }

    return versionData
  })

  // Get edits for a specific version
  app.get<{
    Params: { assessmentId: string; version: string }
  }>('/assessments/:assessmentId/versions/:version/edits', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId, version } = request.params
    const versionNum = parseInt(version, 10)

    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply)
    if (!result) return

    const [versionRow] = await db
      .select({ id: assessmentVersions.id })
      .from(assessmentVersions)
      .where(
        and(
          eq(assessmentVersions.assessmentInstanceId, assessmentId),
          eq(assessmentVersions.version, versionNum),
        ),
      )
      .limit(1)

    if (!versionRow) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/404',
        title: 'Niet gevonden',
        status: 404,
        detail: 'Versie niet gevonden',
        instance: request.url,
      })
    }

    const edits = await db
      .select({
        id: assessmentEdits.id,
        fieldId: assessmentEdits.fieldId,
        editType: assessmentEdits.editType,
        oldValue: assessmentEdits.oldValue,
        newValue: assessmentEdits.newValue,
        editedBy: assessmentEdits.editedBy,
        editedAt: assessmentEdits.editedAt,
      })
      .from(assessmentEdits)
      .where(eq(assessmentEdits.assessmentVersionId, versionRow.id))
      .orderBy(asc(assessmentEdits.editedAt))

    return edits.map(edit => ({ ...edit, version: versionNum }))
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
      .innerJoin(assessmentVersions, eq(assessmentEdits.assessmentVersionId, assessmentVersions.id))
      .where(eq(assessmentVersions.assessmentInstanceId, assessmentId))
      .orderBy(desc(assessmentEdits.editedAt))

    return edits
  })
}

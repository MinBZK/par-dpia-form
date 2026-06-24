import type { FastifyInstance } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, assessmentVersions, assessmentEdits, users } from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth.js'
import { requireAssessmentAccess } from '../middleware/assessmentAccess.js'
import { diffStates } from '../utils/diffStates.js'
import { rebuildState } from '../utils/rebuildState.js'
import { hasOnlyAllowedImages } from '../utils/imageValidator.js'
import { validateState } from '../utils/validateState.js'

// Sentinel to trigger transaction rollback when a concurrent write wins the
// optimistic-lock race (conditional UPDATE affected 0 rows).
class OptimisticLockError extends Error {
  constructor() {
    super('Optimistic lock conflict')
    this.name = 'OptimisticLockError'
  }
}

export async function assessmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  // Get an assessment instance
  app.get<{
    Params: { assessmentId: string }
  }>('/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'viewer', request.url, reply, { includeState: true })
    if (!result) return

    return { ...result.assessment, role: result.role, state: result.assessment.cachedState || null }
  })

  // Update assessment (save state)
  app.put<{
    Params: { assessmentId: string }
    Body: { state?: unknown; changeDescription?: string; name?: string; expectedVersion?: number; newVersion?: boolean }
  }>('/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const { state, changeDescription, name, expectedVersion, newVersion: forceNewVersion } = request.body
    const userId = request.user!.id

    // Restore actions (newVersion + changeDescription) require owner role
    const isRestore = forceNewVersion && changeDescription
    const minimumRole = isRestore ? 'owner' as const : 'editor' as const
    const result = await requireAssessmentAccess(assessmentId, userId, minimumRole, request.url, reply, { includeState: true })
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

    if (!hasOnlyAllowedImages(state)) {
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Ongeldig afbeeldingsformaat. Toegestaan zijn PNG, JPEG, WebP en GIF.',
        instance: request.url,
      })
    }

    const stateValidation = validateState(state)
    if (!stateValidation.valid) {
      request.log.warn({ errors: stateValidation.errors }, 'Assessment state rejected: schema validation failed')
      return reply.status(400).type('application/problem+json').send({
        type: 'https://httpproblems.com/http-status/400',
        title: 'Ongeldig verzoek',
        status: 400,
        detail: 'Assessmentgegevens voldoen niet aan het verwachte formaat.',
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
    // Fast-fail for obviously stale clients. The authoritative check below
    // runs in the WHERE-clause of the UPDATE to prevent simultaneous races
    // (two concurrent writes with the same expectedVersion).
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
    // navigation position without creating a new version). No version bump,
    // no race risk — cachedState UI-state only, overwrite is acceptable.
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
      && !lastVersion.changeDescription
      && (Date.now() - lastVersion.createdAt.getTime()) < CONSOLIDATION_WINDOW_MS

    const nextVersion = assessment.currentVersion + 1

    // Single transaction with the optimistic-lock check in the UPDATE's
    // WHERE-clause (currentVersion = expectedVersion): this both closes the
    // simultaneous-save race and prevents orphan version/edit rows.
    try {
      const updated = await db.transaction(async (tx) => {
        // Conditional UPDATE first: it gates the version/edit writes below.
        const updateData: Record<string, unknown> = {
          currentVersion: nextVersion,
          cachedState: state,
          updatedAt: new Date(),
        }
        if (name) updateData.name = name

        const lockedRows = await tx
          .update(assessmentInstances)
          .set(updateData)
          .where(and(
            eq(assessmentInstances.id, assessmentId),
            eq(assessmentInstances.currentVersion, expectedVersion),
          ))
          .returning()

        if (lockedRows.length === 0) {
          // Signal 409 to outer handler via a sentinel throw that triggers rollback.
          throw new OptimisticLockError()
        }

        if (canConsolidate) {
          // Consolidate: add edits to existing version, bump its version number.
          if (edits.length > 0) {
            await tx.insert(assessmentEdits).values(
              edits.map(edit => ({ ...edit, assessmentVersionId: lastVersion.id })),
            )
          }

          await tx
            .update(assessmentVersions)
            .set({ version: nextVersion, updatedAt: new Date() })
            .where(eq(assessmentVersions.id, lastVersion.id))
        } else {
          // New version row.
          const [versionRow] = await tx.insert(assessmentVersions).values({
            assessmentInstanceId: assessmentId,
            version: nextVersion,
            createdBy: userId,
            changeDescription,
          }).returning()

          if (edits.length > 0) {
            await tx.insert(assessmentEdits).values(
              edits.map(edit => ({ ...edit, assessmentVersionId: versionRow.id })),
            )
          }
        }

        return lockedRows[0]
      })

      return updated
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        // Read fresh version for the client response.
        const [fresh] = await db
          .select({ currentVersion: assessmentInstances.currentVersion })
          .from(assessmentInstances)
          .where(eq(assessmentInstances.id, assessmentId))
          .limit(1)
        return reply.status(409).type('application/problem+json').send({
          type: 'https://httpproblems.com/http-status/409',
          title: 'Conflict',
          status: 409,
          detail: 'Assessment is gewijzigd door een andere gebruiker',
          instance: request.url,
          currentVersion: fresh?.currentVersion,
        })
      }
      throw err
    }
  })

  // Delete assessment
  app.delete<{
    Params: { assessmentId: string }
  }>('/:assessmentId', { schema: { tags: ['assessments'] } }, async (request, reply) => {
    const { assessmentId } = request.params
    const result = await requireAssessmentAccess(assessmentId, request.user!.id, 'owner', request.url, reply)
    if (!result) return

    await db.delete(assessmentInstances).where(eq(assessmentInstances.id, assessmentId))
    return reply.status(204).send()
  })

  // Get version history
  app.get<{
    Params: { assessmentId: string }
  }>('/:assessmentId/versions', { schema: { tags: ['assessments'] } }, async (request, reply) => {
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
  }>('/:assessmentId/versions/:version', { schema: { tags: ['assessments'] } }, async (request, reply) => {
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
  }>('/:assessmentId/versions/:version/edits', { schema: { tags: ['assessments'] } }, async (request, reply) => {
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
  }>('/:assessmentId/versions/:version', { schema: { tags: ['assessments'] } }, async (request, reply) => {
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
  }>('/:assessmentId/edits', { schema: { tags: ['assessments'] } }, async (request, reply) => {
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

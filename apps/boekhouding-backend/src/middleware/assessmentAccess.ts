import type { FastifyReply } from 'fastify'
import { db } from '../db/connection.js'
import { assessmentInstances, projectMembers } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import type { ProjectRole } from './projectAccess.js'

const roleHierarchy: Record<ProjectRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }
const roleLabels: Record<ProjectRole, string> = { viewer: 'kijker', commenter: 'commentator', editor: 'bewerker', owner: 'eigenaar' }

// Lean projection for auth + small metadata. Excludes cachedState (JSONB, potentially large).
type AssessmentAuthRow = {
  id: string
  projectId: string
  currentVersion: number
  updatedAt: Date
}

type AssessmentWithState = AssessmentAuthRow & { cachedState: unknown }

export async function requireAssessmentAccess(
  assessmentId: string,
  userId: string,
  minimumRole: ProjectRole,
  requestUrl: string,
  reply: FastifyReply,
): Promise<{ assessment: AssessmentAuthRow; role: ProjectRole } | null>
export async function requireAssessmentAccess(
  assessmentId: string,
  userId: string,
  minimumRole: ProjectRole,
  requestUrl: string,
  reply: FastifyReply,
  options: { includeState: true },
): Promise<{ assessment: AssessmentWithState; role: ProjectRole } | null>
export async function requireAssessmentAccess(
  assessmentId: string,
  userId: string,
  minimumRole: ProjectRole,
  requestUrl: string,
  reply: FastifyReply,
  options?: { includeState?: boolean },
): Promise<{ assessment: AssessmentAuthRow | AssessmentWithState; role: ProjectRole } | null> {
  const baseCols = {
    id: assessmentInstances.id,
    projectId: assessmentInstances.projectId,
    currentVersion: assessmentInstances.currentVersion,
    updatedAt: assessmentInstances.updatedAt,
    memberRole: projectMembers.role,
  }
  const selection = options?.includeState
    ? { ...baseCols, cachedState: assessmentInstances.cachedState }
    : baseCols

  // Single query: INNER JOIN assessment existence with LEFT JOIN on membership so
  // we can distinguish 404 (no assessment) from 403 (assessment exists, no access).
  const [row] = await db
    .select(selection)
    .from(assessmentInstances)
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
    reply.status(404).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/404',
      title: 'Niet gevonden',
      status: 404,
      detail: 'Assessment niet gevonden',
      instance: requestUrl,
    })
    return null
  }

  if (!row.memberRole || roleHierarchy[row.memberRole] < roleHierarchy[minimumRole]) {
    reply.status(403).type('application/problem+json').send({
      type: 'https://httpproblems.com/http-status/403',
      title: 'Geen toegang',
      status: 403,
      detail: !row.memberRole ? 'Geen lid van dit project' : `De rol ${roleLabels[minimumRole]} is vereist`,
      instance: requestUrl,
    })
    return null
  }

  const { memberRole, ...assessment } = row
  return { assessment, role: memberRole }
}

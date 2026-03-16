import { db } from '../db/connection.js'
import { assessmentEdits, assessmentInstances, assessmentVersions } from '../db/schema.js'
import { eq, and, lte, asc } from 'drizzle-orm'

/**
 * Rebuild the full assessment state by replaying edits from version 1 up to `upToVersion`.
 * Used for version restore — normal reads use cachedState on the instance.
 *
 * Falls back to cachedState if no edits exist (legacy data created before
 * the initial_state edit was introduced).
 */
export async function rebuildState(
  assessmentInstanceId: string,
  upToVersion: number,
): Promise<unknown> {
  // Fetch all edits for versions 1..N, ordered by version then editedAt
  const rows = await db
    .select({
      fieldId: assessmentEdits.fieldId,
      editType: assessmentEdits.editType,
      newValue: assessmentEdits.newValue,
      editedAt: assessmentEdits.editedAt,
      version: assessmentVersions.version,
    })
    .from(assessmentEdits)
    .innerJoin(assessmentVersions, eq(assessmentEdits.assessmentVersionId, assessmentVersions.id))
    .where(
      and(
        eq(assessmentVersions.assessmentInstanceId, assessmentInstanceId),
        lte(assessmentVersions.version, upToVersion),
      ),
    )
    .orderBy(asc(assessmentVersions.version), asc(assessmentEdits.editedAt))

  // No edits found — fall back to cachedState (legacy assessment without initial_state edit)
  if (rows.length === 0) {
    const [instance] = await db
      .select({ cachedState: assessmentInstances.cachedState })
      .from(assessmentInstances)
      .where(eq(assessmentInstances.id, assessmentInstanceId))
      .limit(1)
    return instance?.cachedState ?? {}
  }

  let state: any = {}

  for (const row of rows) {
    if (row.editType === 'initial_state') {
      state = structuredClone(row.newValue) ?? {}
      continue
    }

    // Parse fieldId: either URN-based or namespace.key format
    const parsed = parseFieldId(row.fieldId)
    if (!parsed) continue

    const { namespace, key } = parsed

    switch (row.editType) {
      case 'answer_change': {
        if (!state.answers) state.answers = {}
        if (!state.answers[namespace]) state.answers[namespace] = {}
        if (row.newValue === null) {
          delete state.answers[namespace][key]
        } else {
          state.answers[namespace][key] = row.newValue
        }
        break
      }
      case 'section_complete': {
        if (!state.taskState) state.taskState = {}
        if (!state.taskState[namespace]) {
          state.taskState[namespace] = { currentRootTaskId: '', completedRootTaskIds: [], taskInstances: {} }
        }
        const completed: string[] = state.taskState[namespace].completedRootTaskIds
        const taskId = key.startsWith('completed.') ? key.substring('completed.'.length) : key
        if (row.newValue === true) {
          if (!completed.includes(taskId)) completed.push(taskId)
        } else {
          const idx = completed.indexOf(taskId)
          if (idx !== -1) completed.splice(idx, 1)
        }
        break
      }
      case 'task_instance_add': {
        if (!state.taskState) state.taskState = {}
        if (!state.taskState[namespace]) {
          state.taskState[namespace] = { currentRootTaskId: '', completedRootTaskIds: [], taskInstances: {} }
        }
        state.taskState[namespace].taskInstances[key] = row.newValue
        break
      }
      case 'task_instance_remove': {
        if (state.taskState?.[namespace]?.taskInstances) {
          delete state.taskState[namespace].taskInstances[key]
        }
        break
      }
    }
  }

  return state
}

/**
 * Parse a field ID into namespace and key.
 * Handles both URN format ("urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0")
 * and dot format ("dpia.2.1.3").
 */
function parseFieldId(fieldId: string): { namespace: string; key: string } | null {
  // URN format: "urn:nl:<namespace>:<version>?=task_id=<id>[&task_index=<n>]"
  if (fieldId.startsWith('urn:')) {
    const match = fieldId.match(/^urn:nl:(\w+):[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/)
    if (!match) return null
    const namespace = match[1] === 'prescan_dpia' ? 'prescan' : match[1]
    const taskId = match[2]
    const index = match[3]
    const key = index !== undefined ? `${taskId}[${index}]` : taskId
    return { namespace, key }
  }

  // Dot format: "namespace.rest.of.key"
  const dotIndex = fieldId.indexOf('.')
  if (dotIndex === -1) return null
  return {
    namespace: fieldId.substring(0, dotIndex),
    key: fieldId.substring(dotIndex + 1),
  }
}

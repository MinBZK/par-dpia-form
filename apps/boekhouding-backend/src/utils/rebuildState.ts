import { db } from '../db/connection.js'
import { assessmentEdits, assessmentInstances, assessmentVersions } from '../db/schema.js'
import { eq, and, lte, asc } from 'drizzle-orm'
import { rebuildCacheKey, getCachedRebuild, setCachedRebuild } from './rebuildStateCache.js'

/**
 * Rebuild the full assessment state by replaying edits from version 1 up to `upToVersion`.
 * Used for version restore — normal reads use cachedState on the instance.
 *
 * Falls back to cachedState if no edits exist (legacy data created before
 * the initial_state edit was introduced).
 *
 * `opts.immutable` marks a rebuild of a frozen (older-than-current) version as
 * cacheable, so repeated views of the same historical version skip the replay.
 */
export async function rebuildState(
  assessmentInstanceId: string,
  upToVersion: number,
  opts: { immutable?: boolean } = {},
): Promise<unknown> {
  const cacheKey = rebuildCacheKey(assessmentInstanceId, upToVersion)
  if (opts.immutable) {
    const cached = getCachedRebuild(cacheKey)
    if (cached !== undefined) return cached
  }

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
      // Normalize old namespace-wrapped format so subsequent flat-key edits align
      if (state.answers?.dpia || state.answers?.prescan) {
        const ns = state.answers.dpia ? 'dpia' : 'prescan'
        state.answers = state.answers[ns]
      }
      if (state.taskState) {
        const tsNs = Object.keys(state.taskState)[0]
        if (tsNs) {
          state.metadata = state.metadata || {}
          state.metadata.completedTasks = state.taskState[tsNs]?.completedRootTaskIds || []
        }
        delete state.taskState
      }
      if (state.metadata) {
        delete state.metadata.activeNamespace
      }
      continue
    }

    const key = parseFieldKey(row.fieldId)
    if (!key) continue

    switch (row.editType) {
      case 'answer_change': {
        if (!state.answers) state.answers = {}

        // Check if this is a child of a grouped array (key has [index] suffix)
        const instanceMatch = key.match(/^(.+)\[(\d+)\]$/)
        if (instanceMatch) {
          const childTaskId = instanceMatch[1]
          const index = parseInt(instanceMatch[2])

          const parentKey = findGroupedParent(state.answers, childTaskId)
          if (parentKey) {
            const arr = state.answers[parentKey]
            let element = arr.find((el: any) => el._index === index)
            if (!element) {
              element = { _index: index }
              arr.push(element)
              arr.sort((a: any, b: any) => a._index - b._index)
            }
            if (row.newValue === null) {
              delete element[childTaskId]
            } else {
              element[childTaskId] = row.newValue
            }
            continue
          }
        }

        if (row.newValue === null) {
          delete state.answers[key]
        } else {
          state.answers[key] = row.newValue
        }
        break
      }
      case 'section_complete': {
        if (!state.metadata) state.metadata = {}
        if (!state.metadata.completedTasks) state.metadata.completedTasks = []
        const taskId = key.startsWith('completed.') ? key.substring('completed.'.length) : key
        const completed: string[] = state.metadata.completedTasks
        if (row.newValue === true) {
          if (!completed.includes(taskId)) completed.push(taskId)
        } else {
          const idx = completed.indexOf(taskId)
          if (idx !== -1) completed.splice(idx, 1)
        }
        break
      }
      case 'instance_added': {
        if (!state.answers) state.answers = {}
        const addMatch = key.match(/^(.+)\[(\d+)\]$/)
        if (addMatch) {
          const parentKey = addMatch[1]
          const index = parseInt(addMatch[2])
          if (!Array.isArray(state.answers[parentKey])) {
            state.answers[parentKey] = []
          }
          const arr = state.answers[parentKey]
          if (!arr.find((el: any) => el._index === index)) {
            const element: any = { _index: index }
            // Bundled field values (new format)
            if (row.newValue && typeof row.newValue === 'object') {
              Object.assign(element, row.newValue)
            }
            arr.push(element)
            arr.sort((a: any, b: any) => a._index - b._index)
          }
        }
        break
      }
      case 'instance_removed': {
        if (!state.answers) break
        const removeMatch = key.match(/^(.+)\[(\d+)\]$/)
        if (removeMatch) {
          const parentKey = removeMatch[1]
          const index = parseInt(removeMatch[2])
          const arr = state.answers[parentKey]
          if (Array.isArray(arr)) {
            state.answers[parentKey] = arr.filter((el: any) => el._index !== index)
            if (state.answers[parentKey].length === 0) {
              delete state.answers[parentKey]
            }
          }
        }
        break
      }
      // Legacy edit types — ignore
      case 'task_instance_add':
      case 'task_instance_remove':
        break
    }
  }

  // Only cache the deterministic replay result, never the cachedState fallback
  // above (that path depends on the mutable instance state).
  if (opts.immutable) setCachedRebuild(cacheKey, state)

  return state
}

/**
 * Find the parent grouped array key that would contain a child task ID.
 */
function findGroupedParent(answers: Record<string, unknown>, childTaskId: string): string | null {
  const parts = childTaskId.split('.')
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('.')
    if (Array.isArray(answers[candidate])) {
      return candidate
    }
  }
  return null
}

/**
 * Extract the answer key from a field ID stored in assessment_edits.
 * The returned key is used internally to locate the answer in the state
 * (either as a direct key or matched to a grouped array element via _index).
 *
 * URN format: "urn:nl:dpia:3.0?=task_id=2.1.3" → "2.1.3"
 * URN with index: "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0" → "2.1.3[0]"
 * Legacy dot format: "dpia.2.1.3" → "2.1.3"
 * Plain key: "2.1.3" → "2.1.3"
 */
function parseFieldKey(fieldId: string): string | null {
  // URN format
  if (fieldId.startsWith('urn:')) {
    const match = fieldId.match(/^urn:nl:\w+:[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/)
    if (!match) return null
    const taskId = match[1]
    const index = match[2]
    return index !== undefined ? `${taskId}[${index}]` : taskId
  }

  // Legacy dot format: "dpia.rest.of.key" or "prescan.rest.of.key"
  if (fieldId.startsWith('dpia.') || fieldId.startsWith('prescan.')) {
    const dotIndex = fieldId.indexOf('.')
    return fieldId.substring(dotIndex + 1)
  }

  // Plain key (new format)
  return fieldId
}

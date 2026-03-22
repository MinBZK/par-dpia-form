import { type AssessmentState, OUTPUT_SCHEMA_URL } from '../models/assessmentState'
import { type FormType } from '../models/dpia'
import { type Answer } from '../stores/answers'

// Legacy DPIATaskState shape (before taskInstances removal)
interface LegacyDPIATaskState {
  currentRootTaskId?: string
  completedRootTaskIds: string[]
  taskInstances?: Record<string, LegacyTaskInstance>
}

interface LegacyTaskInstance {
  id: string
  taskId: string
  groupId: string
  parentInstanceId: string | null
  childInstanceIds: string[]
  mappedFromInstanceId?: string
}

/**
 * Detect whether a state is v1 (nanoid-based keys).
 * V1 keys look like "2.1.3_xK9mQ7p" — taskId followed by underscore and nanoid.
 * V2 keys look like "2.1.3" or "2.1.3[0]".
 */
function isV1State(state: AssessmentState): boolean {
  if (state.$schema) return false

  // Check answer keys for nanoid pattern (taskId_randomchars)
  for (const ns of Object.keys(state.answers || {})) {
    const answers = state.answers[ns as FormType]
    if (!answers) continue
    for (const key of Object.keys(answers)) {
      if (key.includes('_') && !key.startsWith('completed.')) return true
    }
  }

  // Check taskInstance keys in legacy state
  const taskState = (state as any).taskState ?? {}
  for (const ns of Object.keys(taskState)) {
    const nsState = taskState[ns] as LegacyDPIATaskState | undefined
    if (!nsState?.taskInstances) continue
    for (const key of Object.keys(nsState.taskInstances)) {
      if (key.includes('_')) return true
    }
  }

  return false
}

/**
 * Migrate a v1 state (nanoid-based keys) to v2 (taskId / taskId[index] keys).
 * Also strips legacy fields (taskInstances, currentRootTaskId, activeNamespace)
 * from any state — v1 or already-v2.
 *
 * @param state The state to migrate
 * @param urnLookup Mapping from FormType to URN string (e.g. { "dpia": "urn:nl:dpia:3.0" })
 * @returns The migrated state (same reference if already clean v2)
 */
export function migrateStateV1toV2(
  state: AssessmentState,
  urnLookup: Record<string, string>,
): AssessmentState {
  // Guard: empty or incomplete state objects (new assessments)
  if (!state.metadata) return state

  if (isV1State(state)) {
    return migrateV1Keys(state, urnLookup)
  }

  // Already v2 — strip legacy fields if present
  return stripLegacyFields(state, urnLookup)
}

/**
 * Full v1→v2 migration: rewrite nanoid-based answer keys using taskInstance mapping.
 */
function migrateV1Keys(
  state: AssessmentState,
  urnLookup: Record<string, string>,
): AssessmentState {
  const legacyMetadata = state.metadata as any
  const migratedState: any = {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      urn: urnLookup[legacyMetadata.activeNamespace || 'dpia'] || state.metadata.urn,
      createdAt: state.metadata.createdAt,
    },
    taskState: {},
    answers: {},
  }

  const legacyTaskState = (state as any).taskState ?? {}

  for (const ns of Object.keys(legacyTaskState) as FormType[]) {
    const taskState = legacyTaskState[ns] as LegacyDPIATaskState | undefined
    if (!taskState) continue

    const oldToNew = new Map<string, string>()
    const taskIdCounters = new Map<string, number>()
    const instances = taskState.taskInstances || {}

    // First pass: count instances per taskId
    const sortedOldIds = Object.keys(instances).sort()
    for (const oldId of sortedOldIds) {
      const taskId = instances[oldId].taskId
      const count = taskIdCounters.get(taskId) || 0
      taskIdCounters.set(taskId, count + 1)
    }

    // Determine which taskIds have multiple instances (repeatable)
    const repeatableTaskIds = new Set<string>()
    for (const [taskId, count] of taskIdCounters) {
      if (count > 1) repeatableTaskIds.add(taskId)
    }

    // Assign new IDs
    const assignedCounters = new Map<string, number>()
    for (const oldId of sortedOldIds) {
      const taskId = instances[oldId].taskId
      let newId: string
      if (repeatableTaskIds.has(taskId)) {
        const idx = assignedCounters.get(taskId) || 0
        newId = `${taskId}[${idx}]`
        assignedCounters.set(taskId, idx + 1)
      } else {
        newId = taskId
      }
      oldToNew.set(oldId, newId)
    }

    // Output only completedRootTaskIds (no taskInstances, no currentRootTaskId)
    if (!migratedState.taskState) migratedState.taskState = {}
    migratedState.taskState[ns] = {
      completedRootTaskIds: [...(taskState.completedRootTaskIds || [])],
    }

    // Migrate answers using the ID mapping
    const oldAnswers = state.answers[ns]
    if (oldAnswers) {
      const newAnswers: Record<string, Answer> = {}
      for (const [oldKey, answer] of Object.entries(oldAnswers)) {
        const newKey = oldToNew.get(oldKey) ?? oldKey
        newAnswers[newKey] = answer
      }
      migratedState.answers[ns] = newAnswers
    }
  }

  return migratedState
}

/**
 * Strip legacy fields from an already-v2 state:
 * - taskState.*.taskInstances
 * - taskState.*.currentRootTaskId
 * - metadata.activeNamespace
 */
function stripLegacyFields(
  state: AssessmentState,
  urnLookup: Record<string, string>,
): AssessmentState {
  if (!state.metadata) return state
  const legacyMetadata = state.metadata as any
  const hasLegacyFields =
    legacyMetadata.activeNamespace !== undefined ||
    Object.values((state as any).taskState ?? {}).some(
      (ts: any) => ts?.taskInstances || ts?.currentRootTaskId,
    )

  if (!hasLegacyFields) return state

  const cleaned: any = {
    ...state,
    metadata: {
      urn: state.metadata.urn || urnLookup[legacyMetadata.activeNamespace || 'dpia'],
      createdAt: state.metadata.createdAt,
    },
    taskState: {},
  }

  const legacyTaskState = (state as any).taskState ?? {}
  for (const ns of Object.keys(legacyTaskState) as FormType[]) {
    const tsRaw = legacyTaskState[ns] as LegacyDPIATaskState | undefined
    if (!tsRaw) continue
    if (!cleaned.taskState) cleaned.taskState = {}
    cleaned.taskState[ns] = {
      completedRootTaskIds: [...(tsRaw.completedRootTaskIds || [])],
    }
  }

  return cleaned
}

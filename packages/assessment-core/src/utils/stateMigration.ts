import { type AssessmentState, type DPIATaskState, OUTPUT_SCHEMA_URL } from '../models/assessmentState'
import { type TaskInstance } from '../stores/tasks'
import { type FormType } from '../models/dpia'
import { type Answer } from '../stores/answers'

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

  // Check taskInstance keys
  for (const ns of Object.keys(state.taskState ?? {})) {
    const taskState = state.taskState?.[ns as FormType]
    if (!taskState) continue
    for (const key of Object.keys(taskState.taskInstances || {})) {
      if (key.includes('_')) return true
    }
  }

  return false
}

/**
 * Parse a v1 instance ID (e.g. "2.1.3_xK9mQ7p") into the task ID ("2.1.3").
 */
function parseV1InstanceId(instanceId: string): string {
  const underscoreIdx = instanceId.lastIndexOf('_')
  if (underscoreIdx === -1) return instanceId
  return instanceId.substring(0, underscoreIdx)
}

/**
 * Migrate a v1 state (nanoid-based keys) to v2 (taskId / taskId[index] keys).
 *
 * @param state The state to migrate
 * @param urnLookup Mapping from FormType to URN string (e.g. { "dpia": "urn:nl:dpia:3.0" })
 * @returns The migrated state (same reference if already v2)
 */
export function migrateStateV1toV2(
  state: AssessmentState,
  urnLookup: Record<string, string>,
): AssessmentState {
  if (!isV1State(state)) return state

  const migratedState: AssessmentState = {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      ...state.metadata,
      urn: urnLookup[state.metadata.activeNamespace || 'dpia'] || state.metadata.urn,
    },
    taskState: {},
    answers: {},
  }

  // Build old→new ID mapping per namespace
  for (const ns of Object.keys(state.taskState ?? {}) as FormType[]) {
    const taskState = state.taskState?.[ns]
    if (!taskState) continue

    const oldToNew = new Map<string, string>()
    const taskIdCounters = new Map<string, number>()

    // First pass: determine new IDs for all instances
    // Sort by old ID to maintain deterministic ordering
    const sortedOldIds = Object.keys(taskState.taskInstances).sort()
    for (const oldId of sortedOldIds) {
      const instance = taskState.taskInstances[oldId]
      const taskId = instance.taskId

      // Count instances per taskId to determine if indexing is needed
      const count = taskIdCounters.get(taskId) || 0
      taskIdCounters.set(taskId, count + 1)
    }

    // Second pass: determine which taskIds have multiple instances (repeatable)
    const repeatableTaskIds = new Set<string>()
    for (const [taskId, count] of taskIdCounters) {
      if (count > 1) repeatableTaskIds.add(taskId)
    }

    // Third pass: assign new IDs
    const assignedCounters = new Map<string, number>()
    for (const oldId of sortedOldIds) {
      const instance = taskState.taskInstances[oldId]
      const taskId = instance.taskId

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

    // Migrate task instances
    const newInstances: Record<string, TaskInstance> = {}
    for (const oldId of sortedOldIds) {
      const instance = taskState.taskInstances[oldId]
      const newId = oldToNew.get(oldId)!

      newInstances[newId] = {
        id: newId,
        taskId: instance.taskId,
        groupId: instance.groupId,
        parentInstanceId: instance.parentInstanceId
          ? (oldToNew.get(instance.parentInstanceId) ?? instance.parentInstanceId)
          : null,
        childInstanceIds: instance.childInstanceIds.map(
          childId => oldToNew.get(childId) ?? childId,
        ),
        ...(instance.mappedFromInstanceId && {
          mappedFromInstanceId: oldToNew.get(instance.mappedFromInstanceId) ?? instance.mappedFromInstanceId,
        }),
      }
    }

    const newTaskState: DPIATaskState = {
      currentRootTaskId: taskState.currentRootTaskId,
      completedRootTaskIds: [...taskState.completedRootTaskIds],
      taskInstances: newInstances,
    }
    if (!migratedState.taskState) migratedState.taskState = {}
    migratedState.taskState[ns] = newTaskState

    // Migrate answers
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

import { type DPIASnapshot, type DPIATaskState, OUTPUT_SCHEMA_URL } from '../models/dpiaSnapshot'
import { type TaskInstance } from '../stores/tasks'
import { type FormType } from '../models/dpia'
import { type Answer } from '../stores/answers'

/**
 * Detect whether a snapshot is v1 (nanoid-based keys).
 * V1 keys look like "2.1.3_xK9mQ7p" — taskId followed by underscore and nanoid.
 * V2 keys look like "2.1.3" or "2.1.3[0]".
 */
function isV1Snapshot(snapshot: DPIASnapshot): boolean {
  if (snapshot.$schema) return false

  // Check answer keys for nanoid pattern (taskId_randomchars)
  for (const ns of Object.keys(snapshot.answers || {})) {
    const answers = snapshot.answers[ns as FormType]
    if (!answers) continue
    for (const key of Object.keys(answers)) {
      if (key.includes('_') && !key.startsWith('completed.')) return true
    }
  }

  // Check taskInstance keys
  for (const ns of Object.keys(snapshot.taskState ?? {})) {
    const state = snapshot.taskState?.[ns as FormType]
    if (!state) continue
    for (const key of Object.keys(state.taskInstances || {})) {
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
 * Migrate a v1 snapshot (nanoid-based keys) to v2 (taskId / taskId[index] keys).
 *
 * @param snapshot The snapshot to migrate
 * @param urnLookup Mapping from FormType to URN string (e.g. { "dpia": "urn:nl:dpia:3.0" })
 * @returns The migrated snapshot (same reference if already v2)
 */
export function migrateSnapshotV1toV2(
  snapshot: DPIASnapshot,
  urnLookup: Record<string, string>,
): DPIASnapshot {
  if (!isV1Snapshot(snapshot)) return snapshot

  const migratedSnapshot: DPIASnapshot = {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      ...snapshot.metadata,
      urn: urnLookup[snapshot.metadata.activeNamespace || 'dpia'] || snapshot.metadata.urn,
    },
    taskState: {},
    answers: {},
  }

  // Build old→new ID mapping per namespace
  for (const ns of Object.keys(snapshot.taskState ?? {}) as FormType[]) {
    const state = snapshot.taskState?.[ns]
    if (!state) continue

    const oldToNew = new Map<string, string>()
    const taskIdCounters = new Map<string, number>()

    // First pass: determine new IDs for all instances
    // Sort by old ID to maintain deterministic ordering
    const sortedOldIds = Object.keys(state.taskInstances).sort()
    for (const oldId of sortedOldIds) {
      const instance = state.taskInstances[oldId]
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
      const instance = state.taskInstances[oldId]
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
      const instance = state.taskInstances[oldId]
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
      currentRootTaskId: state.currentRootTaskId,
      completedRootTaskIds: [...state.completedRootTaskIds],
      taskInstances: newInstances,
    }
    if (!migratedSnapshot.taskState) migratedSnapshot.taskState = {}
    migratedSnapshot.taskState[ns] = newTaskState

    // Migrate answers
    const oldAnswers = snapshot.answers[ns]
    if (oldAnswers) {
      const newAnswers: Record<string, Answer> = {}
      for (const [oldKey, answer] of Object.entries(oldAnswers)) {
        const newKey = oldToNew.get(oldKey) ?? oldKey
        newAnswers[newKey] = answer
      }
      migratedSnapshot.answers[ns] = newAnswers
    }
  }

  return migratedSnapshot
}

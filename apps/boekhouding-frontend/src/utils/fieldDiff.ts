import type { AssessmentState } from '@overheid-assessment/core'

export interface FieldChange {
  oldValue: unknown
  newValue: unknown
}

/**
 * Compares two AssessmentState objects and returns a map of changed fields.
 * Keys use "namespace.key" format (e.g., "dpia.2.1" or "dpia.completed.1").
 * Only compares answers and completedRootTaskIds — metadata and navigation state are excluded.
 */
export function computeFieldDiff(
  oldState: AssessmentState | null,
  newState: AssessmentState | null,
): Map<string, FieldChange> {
  const changes = new Map<string, FieldChange>()

  const oldAnswers = oldState?.answers || {}
  const newAnswers = newState?.answers || {}
  const allNamespaces = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const ns of allNamespaces) {
    const oldNs = oldAnswers[ns as keyof typeof oldAnswers] || {}
    const newNs = newAnswers[ns as keyof typeof newAnswers] || {}
    const allKeys = new Set([...Object.keys(oldNs), ...Object.keys(newNs)])

    for (const key of allKeys) {
      const oldVal = (oldNs as Record<string, unknown>)[key]
      const newVal = (newNs as Record<string, unknown>)[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.set(`${ns}.${key}`, { oldValue: oldVal ?? null, newValue: newVal ?? null })
      }
    }
  }

  // Compare completedRootTaskIds
  const oldTaskState = oldState?.taskState || {}
  const newTaskState = newState?.taskState || {}
  const taskNamespaces = new Set([...Object.keys(oldTaskState), ...Object.keys(newTaskState)])

  for (const ns of taskNamespaces) {
    const oldCompleted = new Set(oldTaskState[ns as keyof typeof oldTaskState]?.completedRootTaskIds || [])
    const newCompleted = new Set(newTaskState[ns as keyof typeof newTaskState]?.completedRootTaskIds || [])

    for (const id of newCompleted) {
      if (!oldCompleted.has(id)) {
        changes.set(`${ns}.completed.${id}`, { oldValue: false, newValue: true })
      }
    }
    for (const id of oldCompleted) {
      if (!newCompleted.has(id)) {
        changes.set(`${ns}.completed.${id}`, { oldValue: true, newValue: false })
      }
    }
  }

  return changes
}

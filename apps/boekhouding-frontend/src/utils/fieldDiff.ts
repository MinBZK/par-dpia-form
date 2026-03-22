import type { AssessmentState } from '@overheid-assessment/core'

export interface FieldChange {
  oldValue: unknown
  newValue: unknown
}

/**
 * Compares two AssessmentState objects and returns a map of changed fields.
 * States use the unified format (no namespace wrapping).
 * Keys are answer keys (e.g. "2.1") or completed markers (e.g. "completed.1").
 */
export function computeFieldDiff(
  oldState: AssessmentState | null,
  newState: AssessmentState | null,
): Map<string, FieldChange> {
  const changes = new Map<string, FieldChange>()

  const oldAnswers = oldState?.answers || {}
  const newAnswers = newState?.answers || {}
  const allKeys = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const key of allKeys) {
    const oldVal = oldAnswers[key]
    const newVal = newAnswers[key]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.set(key, { oldValue: oldVal ?? null, newValue: newVal ?? null })
    }
  }

  // Compare completedTasks in metadata
  const oldCompleted = new Set(oldState?.metadata?.completedTasks || [])
  const newCompleted = new Set(newState?.metadata?.completedTasks || [])

  for (const id of newCompleted) {
    if (!oldCompleted.has(id)) {
      changes.set(`completed.${id}`, { oldValue: false, newValue: true })
    }
  }
  for (const id of oldCompleted) {
    if (!newCompleted.has(id)) {
      changes.set(`completed.${id}`, { oldValue: true, newValue: false })
    }
  }

  return changes
}

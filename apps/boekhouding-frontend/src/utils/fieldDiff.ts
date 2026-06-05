import type { AssessmentState } from '@overheid-assessment/core'

export interface FieldChange {
  oldValue: unknown
  newValue: unknown
}

/**
 * Fast equality check for answer values. Uses reference / primitive comparison
 * first, falling back to JSON.stringify only when both sides are non-null objects.
 * This avoids two stringify calls per field on the hot diff path when values are
 * unchanged (the common case on a debounced save).
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
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
    if (!valuesEqual(oldVal, newVal)) {
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

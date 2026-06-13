import { type Answer } from '../stores/answers'
import { type FlatTask, type TaskInstance, parseInstanceId, buildInstanceId } from '../stores/tasks'
import { type IndexedGroupElement, type GroupedAnswerValue } from '../models/assessmentState'

/**
 * Convert flat instance-keyed answers to grouped format for export/persistence.
 *
 * Flat keys like "2.1.1[0]", "2.1.2[0]", "2.1.1[2]" become:
 *   "2.1": [{ _index: 0, "2.1.1": answer, "2.1.2": answer }, { _index: 2, "2.1.1": answer }]
 *
 * Non-repeatable answers pass through unchanged.
 *
 * When taskInstances is provided, empty repeatable instances (with no answers)
 * are preserved as { _index: N } entries so they survive a save/load cycle.
 */
export function groupAnswers(
  flatAnswers: Record<string, Answer>,
  flatTasks: Record<string, FlatTask>,
  taskInstances?: Record<string, TaskInstance>,
): Record<string, GroupedAnswerValue> {
  // Find all repeatable parent task IDs and collect their children
  const repeatableParents = new Set<string>()
  const childToRepeatableParent = new Map<string, string>()

  for (const [taskId, task] of Object.entries(flatTasks)) {
    if (task.repeatable) {
      repeatableParents.add(taskId)
      for (const childId of task.childrenIds) {
        childToRepeatableParent.set(childId, taskId)
      }
    }
  }

  // Build grouped elements per repeatable parent
  // Map: parentId -> Map<index, IndexedGroupElement>
  const grouped = new Map<string, Map<number, IndexedGroupElement>>()

  const result: Record<string, GroupedAnswerValue> = {}

  for (const [instanceId, answer] of Object.entries(flatAnswers)) {
    const parsed = parseInstanceId(instanceId)

    if (parsed.index !== undefined && childToRepeatableParent.has(parsed.taskId)) {
      // This is a child of a repeatable parent with an index
      const parentId = childToRepeatableParent.get(parsed.taskId)!

      if (!grouped.has(parentId)) {
        grouped.set(parentId, new Map())
      }
      const parentMap = grouped.get(parentId)!

      if (!parentMap.has(parsed.index)) {
        parentMap.set(parsed.index, { _index: parsed.index })
      }
      parentMap.get(parsed.index)![parsed.taskId] = answer
    } else {
      // Non-repeatable answer — pass through
      result[instanceId] = answer
    }
  }

  // Include empty instances that exist in taskInstances but have no answers.
  // Only when the user has added extras beyond the single default instance,
  // to avoid saving default [0] entries for every repeatable task.
  if (taskInstances) {
    for (const [taskId, task] of Object.entries(flatTasks)) {
      if (!task.repeatable) continue

      const existingIndices = new Set<number>()
      for (const instance of Object.values(taskInstances)) {
        if (instance.taskId === taskId) {
          const parsed = parseInstanceId(instance.id)
          if (parsed.index !== undefined) existingIndices.add(parsed.index)
        }
      }

      // Skip when only the default instance exists — it gets recreated by init()
      if (existingIndices.size <= 1 && !grouped.has(taskId)) continue

      if (!grouped.has(taskId)) {
        grouped.set(taskId, new Map())
      }
      const parentMap = grouped.get(taskId)!

      for (const index of existingIndices) {
        if (!parentMap.has(index)) {
          parentMap.set(index, { _index: index })
        }
      }
    }
  }

  // Convert grouped maps to sorted arrays
  for (const [parentId, indexMap] of grouped) {
    const elements = Array.from(indexMap.values())
    elements.sort((a, b) => a._index - b._index)
    result[parentId] = elements
  }

  return result
}

/**
 * Convert grouped answers back to flat instance-keyed format for internal use.
 *
 * Grouped format:
 *   "2.1": [{ _index: 0, "2.1.1": answer, "2.1.2": answer }, { _index: 2, "2.1.1": answer }]
 * becomes:
 *   "2.1.1[0]": answer, "2.1.2[0]": answer, "2.1.1[2]": answer
 *
 * No task definitions needed — the structure is self-describing.
 */
export function flattenGroupedAnswers(
  grouped: Record<string, GroupedAnswerValue>,
): Record<string, Answer> {
  const result: Record<string, Answer> = {}

  for (const [key, value] of Object.entries(grouped)) {
    if (Array.isArray(value)) {
      // Grouped array — expand each element
      for (const element of value) {
        const index = element._index
        for (const [childKey, childValue] of Object.entries(element)) {
          if (childKey === '_index') continue
          result[buildInstanceId(childKey, index)] = childValue as Answer
        }
      }
    } else if (isAnswer(value)) {
      // Regular flat answer — pass through
      result[key] = value
    }
  }

  return result
}

/** Type guard: check if a value is an Answer-like object (has 'value' property, is not an array). */
function isAnswer(value: unknown): value is Answer {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'value' in value
  )
}

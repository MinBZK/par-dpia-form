import type { AssessmentState, GroupedAnswerValue, IndexedGroupElement } from '../models/assessmentState'
import type { TaskStoreType } from '../stores/tasks'
import type { AnswerStoreType } from '../stores/answers'
import { parseInstanceId } from '../stores/tasks'
import { flattenGroupedAnswers } from './groupedAnswers'

/**
 * Apply an AssessmentState to the task and answer stores.
 * The state uses the unified format (no namespace wrapping).
 * Flattens grouped answers and writes to the active namespace.
 */
export function applyStateToStores(
  state: AssessmentState,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): void {
  const ns = taskStore.activeNamespace

  // Apply completedTasks
  if (state.metadata?.completedTasks?.length) {
    taskStore.completedRootTaskIds[ns] = new Set(state.metadata.completedTasks)
  }

  // Flatten grouped answers if present, then apply
  const answers = state.answers || {}
  if (Object.keys(answers).length > 0) {
    const flat = Object.values(answers).some(v => Array.isArray(v))
      ? flattenGroupedAnswers(answers as Record<string, GroupedAnswerValue>)
      : answers

    answerStore.answers[ns] = {}
    Object.assign(answerStore.answers[ns], flat)
  }
}

/**
 * Rebuild repeatable task instances from answer keys and grouped answers.
 * After init() creates default instances (1 per repeatable, index 0),
 * this scans answers for additional indices and creates matching instances.
 *
 * When groupedAnswers is provided (the original un-flattened state),
 * empty instances (with _index but no child answers) are also preserved.
 */
export function rebuildRepeatableInstances(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  groupedAnswers?: Record<string, GroupedAnswerValue>,
): void {
  const ns = taskStore.activeNamespace
  const answers = answerStore.answers[ns] || {}
  const tasks = taskStore.flatTasks[ns]

  for (const [taskId, task] of Object.entries(tasks)) {
    if (!task.repeatable) continue

    const indices = new Set<number>()

    // Collect indices from flat answer keys
    for (const childId of task.childrenIds) {
      for (const key of Object.keys(answers)) {
        const parsed = parseInstanceId(key)
        if (parsed.taskId === childId && parsed.index !== undefined) {
          indices.add(parsed.index)
        }
      }
    }

    // Also collect indices from grouped answers (includes empty instances)
    if (groupedAnswers) {
      const groupedValue = groupedAnswers[taskId]
      if (Array.isArray(groupedValue)) {
        for (const element of groupedValue as IndexedGroupElement[]) {
          indices.add(element._index)
        }
      }
    }

    for (const index of Array.from(indices).sort((a, b) => a - b)) {
      if (index === 0) continue
      taskStore.addRepeatableTaskInstance(taskId, task.parentId || undefined, index)
    }

    // Remove default instance (index 0) if it has no answers but other indices do.
    // This happens when a user deleted the first repeatable group.
    if (indices.size > 0 && !indices.has(0)) {
      const defaultInstanceId = `${taskId}[0]`
      taskStore.removeRepeatableTaskInstance(defaultInstanceId)
    }
  }
}

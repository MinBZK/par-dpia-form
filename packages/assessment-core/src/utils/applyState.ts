import { FormType } from '../models/dpia'
import type { AssessmentState } from '../models/assessmentState'
import type { TaskStoreType } from '../stores/tasks'
import type { AnswerStoreType } from '../stores/answers'

/**
 * Apply an AssessmentState to the task and answer stores.
 * Handles both full states (with taskInstances) and partial states
 * (e.g. imported AssessmentOutput with only completedRootTaskIds).
 */
export function applyStateToStores(
  state: AssessmentState,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): void {
  if (state.taskState) {
    for (const namespace of Object.keys(state.taskState) as FormType[]) {
      const namespaceState = state.taskState[namespace]
      if (!namespaceState) continue

      if (Object.keys(namespaceState.taskInstances || {}).length > 0) {
        // Only update currentRootTaskId if it's valid — rebuildState produces
        // empty string which crashes task navigation
        if (namespaceState.currentRootTaskId) {
          taskStore.currentRootTaskId[namespace] = namespaceState.currentRootTaskId
        }
        taskStore.taskInstances[namespace] = {}
        Object.assign(taskStore.taskInstances[namespace], namespaceState.taskInstances)
      }

      // Apply completedRootTaskIds independently of taskInstances —
      // imported AssessmentOutput files have completedRootTaskIds derived
      // from answers but empty taskInstances (rebuilt by syncInstances).
      if (namespaceState.completedRootTaskIds?.length > 0) {
        taskStore.completedRootTaskIds[namespace] = new Set(namespaceState.completedRootTaskIds)
      }
    }
  }

  if (state.answers) {
    for (const namespace of Object.keys(state.answers) as FormType[]) {
      if (state.answers[namespace] && Object.keys(state.answers[namespace]!).length > 0) {
        answerStore.answers[namespace] = {}
        Object.assign(answerStore.answers[namespace], state.answers[namespace])
      }
    }
  }
}

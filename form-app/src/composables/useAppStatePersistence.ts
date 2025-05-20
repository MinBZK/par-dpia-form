import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { watch } from 'vue'
import type { FormType } from '@/models/dpia'

export function useAppStatePersistence() {
  const getStorageKey = (namespace: string) => `app_state_${namespace}`

  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  function saveAppState(): void {
    try {
      const namespace = taskStore.activeNamespace
      const dpiaSnapshot: DPIASnapshot = {
        metadata: {
          savedAt: new Date().toISOString(),
          activeNamespace: namespace,
        },

        taskState: {
          [namespace]: {
            currentRootTaskId: taskStore.currentRootTaskId[namespace],
            taskInstances: taskStore.taskInstances[namespace],
            completedRootTaskIds: Array.from(taskStore.completedRootTaskIds[namespace]),
          },
        },

        // Save both namespaces for answers
        answers: {
          [namespace]: answerStore.answers[namespace],
        },
      }

      const storageKey = getStorageKey(namespace)
      localStorage.setItem(storageKey, JSON.stringify(dpiaSnapshot))
    } catch (error) {
      console.error('Failed to save app state to local storage:', error)
    }
  }

  function loadAppState(): DPIASnapshot | null {
    try {
      const namespace = taskStore.activeNamespace
      const storageKey = getStorageKey(namespace)
      const dpiaSnapshotData = localStorage.getItem(storageKey)

      if (!dpiaSnapshotData) {
        return null
      }

      const parsedState = JSON.parse(dpiaSnapshotData) as DPIASnapshot

      // Validate that the parsed state has data for the current namespace
      if (
        parsedState.taskState &&
        parsedState.taskState[namespace] &&
        parsedState.answers &&
        parsedState.answers[namespace]
      ) {
        return parsedState
      }
    } catch (error) {
      console.error('Failed to load app state from local storage:', error)
    }
    return null
  }

  function applyAppState(snapshot: DPIASnapshot): void {
    // Apply state for each namespace in the snapshot
    if (snapshot.taskState) {
      for (const namespace of Object.keys(snapshot.taskState) as FormType[]) {
        const namespaceState = snapshot.taskState[namespace]

        if (namespaceState && Object.keys(namespaceState.taskInstances || {}).length > 0) {
          // Apply task state
          taskStore.currentRootTaskId[namespace] = namespaceState.currentRootTaskId

          // Apply task instances
          taskStore.taskInstances[namespace] = {}
          Object.assign(taskStore.taskInstances[namespace], namespaceState.taskInstances)

          // Apply completed tasks
          taskStore.completedRootTaskIds[namespace] = new Set(namespaceState.completedRootTaskIds)
        }
      }
    }

    // Apply answers for each namespace in the snapshot
    if (snapshot.answers) {
      for (const namespace of Object.keys(snapshot.answers) as FormType[]) {
        if (snapshot.answers[namespace] && Object.keys(snapshot.answers[namespace]).length > 0) {
          // Create a fresh object to avoid reference issues
          answerStore.answers[namespace] = {}
          Object.assign(answerStore.answers[namespace], snapshot.answers[namespace])
        }
      }
    }
  }

  function clearSavedState(namespace: string): void {
    const storageKey = getStorageKey(namespace)
    localStorage.removeItem(storageKey)
  }

  function setupWatchers() {
    watch(
      [() => taskStore.currentRootTaskId, () => taskStore.taskInstances, () => answerStore.answers],
      () => {
        if (taskStore.isInitialized[taskStore.activeNamespace]) {
          saveAppState()
        }
      },
      { deep: true },
    )
  }

  return {
    saveAppState,
    loadAppState,
    applyAppState,
    clearSavedState,
    setupWatchers,
  }
}

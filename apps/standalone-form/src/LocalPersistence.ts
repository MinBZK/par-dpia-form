import { watch } from 'vue'
import {
  useAnswerStore,
  useTaskStore,
  useSchemaStore,
  FormType,
  OUTPUT_SCHEMA_URL,
  type PersistenceProvider,
  type DPIASnapshot,
  migrateSnapshotV1toV2,
} from '@overheid-assessment/core'

function getStorageKey(namespace: string): string {
  return `app_state_${namespace}`
}

export function createLocalPersistence(): PersistenceProvider {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  function saveAppState(): void {
    try {
      const namespace = taskStore.activeNamespace
      const schemaStore = useSchemaStore()
      const dpiaSnapshot: DPIASnapshot = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: new Date().toISOString(),
          activeNamespace: namespace,
          urn: schemaStore.getUrn(namespace),
        },

        taskState: {
          [namespace]: {
            currentRootTaskId: taskStore.currentRootTaskId[namespace],
            taskInstances: taskStore.taskInstances[namespace],
            completedRootTaskIds: Array.from(taskStore.completedRootTaskIds[namespace]),
          },
        },

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

      const schemaStore = useSchemaStore()
      const urnLookup: Record<string, string> = {}
      try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* schema not loaded */ }
      try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* schema not loaded */ }

      const parsedState = migrateSnapshotV1toV2(
        JSON.parse(dpiaSnapshotData) as DPIASnapshot,
        urnLookup,
      )

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
    if (snapshot.taskState) {
      for (const namespace of Object.keys(snapshot.taskState) as FormType[]) {
        const namespaceState = snapshot.taskState[namespace]

        if (namespaceState && Object.keys(namespaceState.taskInstances || {}).length > 0) {
          taskStore.currentRootTaskId[namespace] = namespaceState.currentRootTaskId
          taskStore.taskInstances[namespace] = {}
          Object.assign(taskStore.taskInstances[namespace], namespaceState.taskInstances)
          taskStore.completedRootTaskIds[namespace] = new Set(namespaceState.completedRootTaskIds)
        }
      }
    }

    if (snapshot.answers) {
      for (const namespace of Object.keys(snapshot.answers) as FormType[]) {
        if (snapshot.answers[namespace] && Object.keys(snapshot.answers[namespace]).length > 0) {
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

  function setupWatchers(): void {
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

import { watch } from 'vue'
import {
  useAnswerStore,
  useTaskStore,
  useSchemaStore,
  FormType,
  OUTPUT_SCHEMA_URL,
  type PersistenceProvider,
  type AssessmentState,
  migrateStateV1toV2,
  applyStateToStores,
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
      const state: AssessmentState = {
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
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save app state to local storage:', error)
    }
  }

  function loadAppState(): AssessmentState | null {
    try {
      const namespace = taskStore.activeNamespace
      const storageKey = getStorageKey(namespace)
      const stateData = localStorage.getItem(storageKey)

      if (!stateData) {
        return null
      }

      const schemaStore = useSchemaStore()
      const urnLookup: Record<string, string> = {}
      try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* schema not loaded */ }
      try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* schema not loaded */ }

      const parsedState = migrateStateV1toV2(
        JSON.parse(stateData) as AssessmentState,
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

  function applyAppState(state: AssessmentState): void {
    applyStateToStores(state, taskStore, answerStore)
  }

  function clearSavedState(namespace?: FormType): void {
    const ns = namespace ?? taskStore.activeNamespace
    const storageKey = getStorageKey(ns)
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

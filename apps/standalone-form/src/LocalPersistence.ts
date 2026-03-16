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
    if (state.taskState) {
      for (const namespace of Object.keys(state.taskState) as FormType[]) {
        const namespaceState = state.taskState[namespace]

        if (namespaceState && Object.keys(namespaceState.taskInstances || {}).length > 0) {
          taskStore.currentRootTaskId[namespace] = namespaceState.currentRootTaskId
          taskStore.taskInstances[namespace] = {}
          Object.assign(taskStore.taskInstances[namespace], namespaceState.taskInstances)
          taskStore.completedRootTaskIds[namespace] = new Set(namespaceState.completedRootTaskIds)
        }
      }
    }

    if (state.answers) {
      for (const namespace of Object.keys(state.answers) as FormType[]) {
        if (state.answers[namespace] && Object.keys(state.answers[namespace]).length > 0) {
          answerStore.answers[namespace] = {}
          Object.assign(answerStore.answers[namespace], state.answers[namespace])
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

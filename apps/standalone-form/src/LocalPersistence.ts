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
  groupAnswers,
} from '@overheid-assessment/core'

function getStorageKey(namespace: string): string {
  return `app_state_${namespace}`
}

function getUiStorageKey(namespace: string): string {
  return `ui_state_${namespace}`
}

export function createLocalPersistence(): PersistenceProvider {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  function saveAppState(): void {
    try {
      const ns = taskStore.activeNamespace
      const schemaStore = useSchemaStore()

      const flatAnswers = answerStore.answers[ns] || {}
      const flatTasks = taskStore.flatTasks[ns] || {}
      const completedTasks = Array.from(taskStore.completedRootTaskIds[ns])
        .sort((a, b) => parseInt(a) - parseInt(b))

      // Save in unified format (same as API/export)
      const state: AssessmentState = {
        $schema: OUTPUT_SCHEMA_URL,
        metadata: {
          createdAt: new Date().toISOString(),
          urn: schemaStore.getUrn(ns),
          ...(completedTasks.length > 0 && { completedTasks }),
        },
        answers: Object.keys(flatTasks).length > 0
          ? groupAnswers(flatAnswers, flatTasks, taskStore.taskInstances[ns])
          : flatAnswers,
      }

      localStorage.setItem(getStorageKey(ns), JSON.stringify(state))
      localStorage.setItem(getUiStorageKey(ns), JSON.stringify({
        currentRootTaskId: taskStore.currentRootTaskId[ns],
      }))
    } catch (error) {
      console.error('Failed to save app state to local storage:', error)
    }
  }

  function loadAppState(): AssessmentState | null {
    try {
      const ns = taskStore.activeNamespace
      const stateData = localStorage.getItem(getStorageKey(ns))
      if (!stateData) return null

      const schemaStore = useSchemaStore()
      const urnLookup: Record<string, string> = {}
      try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* */ }
      try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* */ }

      const raw = JSON.parse(stateData)
      const migrated = migrateStateV1toV2(raw as any, urnLookup)

      const answers = (migrated as any).answers || {}
      const metadata = migrated.metadata || {} as any

      // Old format: answers wrapped in namespace key
      const isNamespaced = answers[FormType.DPIA] || answers[FormType.PRE_SCAN]

      let resolvedAnswers: Record<string, any>
      let completedTasks: string[]

      if (isNamespaced) {
        resolvedAnswers = answers[ns] || {}
        completedTasks = (migrated as any).taskState?.[ns]?.completedRootTaskIds
          || metadata.completedTasks || []
      } else {
        resolvedAnswers = answers
        completedTasks = metadata.completedTasks || []
      }

      const state: AssessmentState = {
        metadata: {
          urn: metadata.urn,
          createdAt: metadata.createdAt || new Date().toISOString(),
          ...(completedTasks.length > 0 && { completedTasks }),
        },
        answers: resolvedAnswers,
      }

      if (Object.keys(state.answers).length > 0) {
        return state
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
    localStorage.removeItem(getStorageKey(ns))
    localStorage.removeItem(getUiStorageKey(ns))
  }

  function setupWatchers(): void {
    watch(
      [() => taskStore.currentRootTaskId, () => taskStore.completedRootTaskIds, () => answerStore.answers, () => taskStore.taskInstances],
      () => {
        if (taskStore.isInitialized[taskStore.activeNamespace]) {
          saveAppState()
        }
      },
      { deep: true },
    )
  }

  function restoreUiState(): void {
    try {
      const ns = taskStore.activeNamespace
      const uiData = localStorage.getItem(getUiStorageKey(ns))
      if (uiData) {
        const uiState = JSON.parse(uiData)
        if (uiState.currentRootTaskId) {
          taskStore.currentRootTaskId[ns] = uiState.currentRootTaskId
        }
      } else {
        // Fallback: recover from old DPIASnapshot format
        const stateData = localStorage.getItem(getStorageKey(ns))
        if (stateData) {
          const raw = JSON.parse(stateData)
          const legacyTaskId = raw?.taskState?.[ns]?.currentRootTaskId
          if (legacyTaskId) {
            taskStore.currentRootTaskId[ns] = legacyTaskId
          }
        }
      }
    } catch { /* ignore */ }
  }

  return {
    saveAppState,
    loadAppState,
    applyAppState,
    clearSavedState,
    setupWatchers,
    restoreUiState,
  }
}

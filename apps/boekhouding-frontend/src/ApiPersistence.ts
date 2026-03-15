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
} from '@par-assessment/core'
import { assessments } from './api'

const DEBOUNCE_MS = 2000

export function createApiPersistence(assessmentId: string): PersistenceProvider {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function buildSnapshot(): DPIASnapshot {
    const namespace = taskStore.activeNamespace
    const schemaStore = useSchemaStore()
    const snapshot: DPIASnapshot = {
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

    // Preserve PRE_SCAN data when the active namespace is DPIA
    const other = namespace === FormType.DPIA ? FormType.PRE_SCAN : FormType.DPIA
    const otherAnswers = answerStore.answers[other]
    const otherInstances = taskStore.taskInstances[other]

    if (otherAnswers && Object.keys(otherAnswers).length > 0) {
      snapshot.answers[other] = otherAnswers
    }
    if (otherInstances && Object.keys(otherInstances).length > 0) {
      snapshot.taskState[other] = {
        currentRootTaskId: taskStore.currentRootTaskId[other],
        taskInstances: otherInstances,
        completedRootTaskIds: Array.from(taskStore.completedRootTaskIds[other]),
      }
    }

    return snapshot
  }

  async function saveAppState(): Promise<void> {
    try {
      const snapshot = buildSnapshot()
      await assessments.update(assessmentId, snapshot)
    } catch (error) {
      console.error('Failed to save form state to API:', error)
    }
  }

  function debouncedSave() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => saveAppState(), DEBOUNCE_MS)
  }

  function flushSave() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    saveAppState()
  }


  async function loadAppState(namespace: FormType): Promise<DPIASnapshot | null> {
    try {
      const form = await assessments.get(assessmentId)
      if (form.snapshot) {
        const schemaStore = useSchemaStore()
        const urnLookup: Record<string, string> = {}
        try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* schema not loaded */ }
        try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* schema not loaded */ }

        const snapshot = migrateSnapshotV1toV2(form.snapshot as DPIASnapshot, urnLookup)
        if (
          snapshot.taskState &&
          snapshot.taskState[namespace] &&
          snapshot.answers &&
          snapshot.answers[namespace]
        ) {
          return snapshot
        }
      }
    } catch (error) {
      console.error('Failed to load form state from API:', error)
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

  async function clearSavedState(namespace: FormType): Promise<void> {
    try {
      const emptySnapshot: DPIASnapshot = {
        metadata: { createdAt: new Date().toISOString(), activeNamespace: namespace },
        taskState: {},
        answers: {},
      }
      await assessments.update(assessmentId, emptySnapshot)
    } catch (error) {
      console.error('Failed to clear form state:', error)
    }
  }

  function setupWatchers(): () => void {
    const triggerSave = () => {
      if (taskStore.isInitialized[taskStore.activeNamespace]) {
        debouncedSave()
      }
    }

    watch(
      [() => taskStore.currentRootTaskId, () => taskStore.taskInstances, () => taskStore.completedRootTaskIds, () => answerStore.answers],
      triggerSave,
      { deep: true },
    )

    // Flush pending save when page becomes hidden (tab switch, refresh, navigate away).
    // Unlike beforeunload, the page is still alive so fetch works normally.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
        saveAppState()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    }
  }

  return {
    saveAppState,
    loadAppState,
    applyAppState,
    clearSavedState,
    setupWatchers,
    flushSave,
  }
}

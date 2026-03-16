import { nextTick, reactive, watch } from 'vue'
import {
  useAnswerStore,
  useTaskStore,
  useSchemaStore,
  FormType,
  OUTPUT_SCHEMA_URL,
  type PersistenceProvider,
  type AssessmentState,
  migrateStateV1toV2,
  getPlainTextWithoutDefinitions,
} from '@overheid-assessment/core'
import { assessments, ApiError } from './api'
import { computeFieldDiff } from './utils/fieldDiff'
import type { ConflictField } from './components/ConflictResolutionDialog.vue'

const DEBOUNCE_MS = 2000

export interface ConflictState {
  active: boolean
  fields: ConflictField[]
  resolve: (resolutions: Map<string, 'mine' | 'theirs'>) => void
}

export function createApiPersistence(assessmentId: string) {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let knownVersion: number | undefined

  // Track state for conflict resolution
  let lastSavedState: AssessmentState | null = null
  const pendingChanges = new Map<string, { namespace: string; key: string; value: unknown }>()

  // Callback stored outside reactive to avoid Vue proxy issues with functions
  let resolveCallback: ((resolutions: Map<string, 'mine' | 'theirs'>) => void) | null = null

  // Reactive conflict state exposed to the UI
  const conflictState = reactive<ConflictState>({
    active: false,
    fields: [],
    resolve(resolutions: Map<string, 'mine' | 'theirs'>) {
      resolveCallback?.(resolutions)
    },
  })

  function buildState(): AssessmentState {
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

    // Preserve PRE_SCAN data when the active namespace is DPIA
    const other = namespace === FormType.DPIA ? FormType.PRE_SCAN : FormType.DPIA
    const otherAnswers = answerStore.answers[other]
    const otherInstances = taskStore.taskInstances[other]

    if (otherAnswers && Object.keys(otherAnswers).length > 0) {
      state.answers[other] = otherAnswers
    }
    if (otherInstances && Object.keys(otherInstances).length > 0) {
      state.taskState[other] = {
        currentRootTaskId: taskStore.currentRootTaskId[other],
        taskInstances: otherInstances,
        completedRootTaskIds: Array.from(taskStore.completedRootTaskIds[other]),
      }
    }

    return state
  }

  function updatePendingChanges() {
    if (!lastSavedState) return
    const currentState = buildState()
    const diff = computeFieldDiff(lastSavedState, currentState)

    pendingChanges.clear()
    for (const [fieldId, change] of diff) {
      const dotIndex = fieldId.indexOf('.')
      pendingChanges.set(fieldId, {
        namespace: fieldId.substring(0, dotIndex),
        key: fieldId.substring(dotIndex + 1),
        value: change.newValue,
      })
    }
  }

  async function saveAppState(): Promise<void> {
    try {
      updatePendingChanges()

      // Skip if no content changes or version not yet known (loadAppState hasn't completed)
      if (pendingChanges.size === 0 || knownVersion === undefined) {
        return
      }

      const state = buildState()
      const updated = await assessments.update(assessmentId, state, {
        expectedVersion: knownVersion,
      })
      if (updated?.currentVersion) {
        knownVersion = updated.currentVersion
      }
      lastSavedState = JSON.parse(JSON.stringify(buildState()))
      pendingChanges.clear()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await handleConflict()
        return
      }
      console.error('Failed to save form state to API:', error)
    }
  }

  async function handleConflict(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    console.warn('Save conflict detected, attempting field-level merge')

    const fresh = await assessments.get(assessmentId)
    if (!fresh.state) return

    const serverState = fresh.state as AssessmentState

    // What did the server change compared to our last known state?
    const serverDiff = computeFieldDiff(lastSavedState, serverState)

    // Find overlapping fields with genuinely different values
    const conflictKeys = new Set<string>()
    for (const key of pendingChanges.keys()) {
      if (serverDiff.has(key)) {
        const myVal = pendingChanges.get(key)!.value
        const theirVal = serverDiff.get(key)!.newValue
        // Compare semantic values: if both resolve to the same answer, no real conflict
        if (!valuesEqual(myVal, theirVal)) {
          conflictKeys.add(key)
        }
      }
    }

    if (conflictKeys.size === 0) {
      // No overlap — auto-merge: take server state, replay our pending changes on top
      console.info('Auto-merging: no field overlap with server changes')
      applyAppState(serverState)
      replayPendingChanges()
      knownVersion = fresh.currentVersion

      // Save the merged state directly (not via debounce, which would skip
      // because lastSavedState hasn't been written to server yet)
      try {
        const mergedState = buildState()
        const updated = await assessments.update(assessmentId, mergedState, {
          expectedVersion: knownVersion,
        })
        if (updated?.currentVersion) {
          knownVersion = updated.currentVersion
        }
        lastSavedState = JSON.parse(JSON.stringify(buildState()))
        pendingChanges.clear()
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 409) {
          // Another conflict during merge-save — retry the whole flow
          await handleConflict()
        } else {
          console.error('Failed to save merged state:', retryError)
        }
      }
      return
    }

    // Fields overlap — show conflict resolution dialog
    const fields: ConflictField[] = []
    for (const key of conflictKeys) {
      const pending = pendingChanges.get(key)!
      const server = serverDiff.get(key)!
      fields.push({
        fieldId: key,
        label: getFieldLabel(key),
        myValue: pending.value,
        theirValue: server.newValue,
        myFormatted: formatConflictValue(pending.value),
        theirFormatted: formatConflictValue(server.newValue),
      })
    }

    resolveCallback = async (resolutions: Map<string, 'mine' | 'theirs'>) => {
      // Apply server state first
      applyAppState(serverState)

      // Replay non-conflicting pending changes
      replayPendingChanges(conflictKeys)

      // Apply user's conflict resolutions
      for (const [fieldId, choice] of resolutions) {
        if (choice === 'mine') {
          const pending = pendingChanges.get(fieldId)
          if (pending) applyFieldChange(pending.namespace, pending.key, pending.value)
        }
        // 'theirs' is already applied via serverState
      }

      knownVersion = fresh.currentVersion
      conflictState.active = false

      // Save the resolved state directly (not via debounce — same reason as auto-merge)
      try {
        const resolvedState = buildState()
        const updated = await assessments.update(assessmentId, resolvedState, {
          expectedVersion: knownVersion,
        })
        if (updated?.currentVersion) {
          knownVersion = updated.currentVersion
        }
        lastSavedState = JSON.parse(JSON.stringify(buildState()))
        pendingChanges.clear()
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 409) {
          await handleConflict()
        } else {
          console.error('Failed to save resolved state:', retryError)
        }
      }
    }

    // Reset active first so the watcher fires on re-open (false→true transition)
    conflictState.active = false
    conflictState.fields = fields
    await nextTick()
    conflictState.active = true
  }

  function replayPendingChanges(excludeKeys?: Set<string>) {
    for (const [fieldId, change] of pendingChanges) {
      if (excludeKeys?.has(fieldId)) continue
      applyFieldChange(change.namespace, change.key, change.value)
    }
  }

  function applyFieldChange(namespace: string, key: string, value: unknown) {
    const ns = namespace as FormType
    if (key.startsWith('completed.')) {
      const taskId = key.substring('completed.'.length)
      if (value === true) {
        taskStore.completedRootTaskIds[ns]?.add(taskId)
      } else {
        taskStore.completedRootTaskIds[ns]?.delete(taskId)
      }
    } else {
      if (!answerStore.answers[ns]) answerStore.answers[ns] = {}
      if (value === null) {
        delete answerStore.answers[ns][key]
      } else {
        answerStore.answers[ns][key] = value as any
      }
    }
  }

  /**
   * Compare two answer values semantically — ignoring metadata like timestamps.
   * Extracts the .value property from answer objects before comparing.
   */
  function valuesEqual(a: unknown, b: unknown): boolean {
    const aVal = extractAnswerValue(a)
    const bVal = extractAnswerValue(b)
    return JSON.stringify(aVal) === JSON.stringify(bVal)
  }

  function extractAnswerValue(val: unknown): unknown {
    if (val && typeof val === 'object' && 'value' in (val as any)) {
      return (val as any).value
    }
    return val
  }

  function getFieldLabel(fieldId: string): string {
    const dotIndex = fieldId.indexOf('.')
    if (dotIndex === -1) return fieldId
    const ns = fieldId.substring(0, dotIndex)
    const key = fieldId.substring(dotIndex + 1)

    // Strip instance suffix for task lookup (e.g. "2.1_abc" → "2.1")
    const taskId = key.indexOf('_') === -1 ? key : key.substring(0, key.indexOf('_'))
    const formType = ns === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN
    const task = taskStore.getTaskByIdFromNamespace(formType, taskId)

    if (task?.task) {
      const plain = getPlainTextWithoutDefinitions(task.task)
      const label = plain.length > 80 ? plain.substring(0, 77) + '...' : plain
      return task.is_official_id ? `${task.id}. ${label}` : label
    }
    return fieldId
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /** Strip HTML tags from a string using regex (for option labels containing definition spans) */
  function stripHtml(str: string): string {
    if (!str.includes('<')) return str
    return str.replace(/<[^>]*>/g, '')
  }

  function formatConflictValue(val: unknown): string {
    if (val === null || val === undefined) return 'Leeg'
    if (typeof val === 'boolean') return val ? 'Ja' : 'Nee'
    if (typeof val === 'object' && 'value' in (val as any)) {
      const v = (val as any).value
      if (typeof v === 'boolean' || v === 'true' || v === 'false') return (v === true || v === 'true') ? 'Ja' : 'Nee'
      if (Array.isArray(v)) {
        if (v.length === 0) return 'Geen selectie'
        return '<ul style="margin: 0; padding-left: 1.25rem;">' + v.map(item => `<li>${escapeHtml(stripHtml(String(item)))}</li>`).join('') + '</ul>'
      }
      return escapeHtml(stripHtml(String(v))).replace(/\n/g, '<br>')
    }
    if (typeof val === 'string') {
      if (val === 'true') return 'Ja'
      if (val === 'false') return 'Nee'
      return escapeHtml(stripHtml(val)).replace(/\n/g, '<br>') || 'Leeg'
    }
    return escapeHtml(JSON.stringify(val))
  }

  function debouncedSave() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => saveAppState(), DEBOUNCE_MS)
  }

  function flushSave() {
    // Cancel any pending debounced save — don't flush to server.
    // In a multi-user context, flushing stale state on unmount causes race
    // conditions with restores and other users' saves. Losing up to 2 seconds
    // of unsaved work on navigation is an acceptable tradeoff.
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }


  async function loadAppState(namespace: FormType): Promise<AssessmentState | null> {
    try {
      const form = await assessments.get(assessmentId)
      knownVersion = form.currentVersion

      // Always set lastSavedState so conflict detection can track changes,
      // even for new/empty assessments
      const emptyState: AssessmentState = {
        metadata: { createdAt: new Date().toISOString(), activeNamespace: namespace },
        taskState: {},
        answers: {},
      }

      if (form.state) {
        const schemaStore = useSchemaStore()
        const urnLookup: Record<string, string> = {}
        try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* schema not loaded */ }
        try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* schema not loaded */ }

        const state = migrateStateV1toV2(form.state as AssessmentState, urnLookup)

        // Ensure the state has at minimum the namespace keys so the form can initialize.
        // Restored or early versions may lack taskState or answers for this namespace.
        if (!state.answers) state.answers = {}
        if (!state.answers[namespace]) state.answers[namespace] = {}
        if (!state.taskState) state.taskState = {}

        lastSavedState = JSON.parse(JSON.stringify(state))
        return state
      }

      // New or empty assessment — set baseline for change tracking
      lastSavedState = emptyState
    } catch (error) {
      console.error('Failed to load form state from API:', error)
    }
    return null
  }

  function applyAppState(state: AssessmentState): void {
    if (state.taskState) {
      for (const namespace of Object.keys(state.taskState) as FormType[]) {
        const namespaceState = state.taskState[namespace]

        if (namespaceState && Object.keys(namespaceState.taskInstances || {}).length > 0) {
          // Only update currentRootTaskId if it's valid — rebuildState produces
          // empty string which crashes task navigation
          if (namespaceState.currentRootTaskId) {
            taskStore.currentRootTaskId[namespace] = namespaceState.currentRootTaskId
          }
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

  async function clearSavedState(namespace: FormType): Promise<void> {
    try {
      const emptyState: AssessmentState = {
        metadata: { createdAt: new Date().toISOString(), activeNamespace: namespace },
        taskState: {},
        answers: {},
      }
      await assessments.update(assessmentId, emptyState)
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

  const persistence: PersistenceProvider = {
    saveAppState,
    loadAppState,
    applyAppState,
    clearSavedState,
    setupWatchers,
    flushSave,
  }

  return { ...persistence, conflictState }
}

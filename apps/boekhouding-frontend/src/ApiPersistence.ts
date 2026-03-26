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
  applyStateToStores,
  groupAnswers,
  flattenGroupedAnswers,
  parseInstanceId,
  type GroupedAnswerValue,
} from '@overheid-assessment/core'
import { assessments, ApiError, SessionExpiredError } from './api'
import { computeFieldDiff } from './utils/fieldDiff'
import { escapeHtml, stripHtml } from './utils/html'
import type { ConflictField } from './components/ConflictResolutionDialog.vue'

const DEBOUNCE_MS = 500
const UI_STORAGE_PREFIX = 'ui:'

export interface ConflictState {
  active: boolean
  fields: ConflictField[]
  resolve: (resolutions: Map<string, 'mine' | 'theirs'>) => void
}

export function createApiPersistence(assessmentId: string, namespace?: string) {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let knownVersion: number | undefined

  let lastSavedState: AssessmentState | null = null
  const pendingChanges = new Map<string, { key: string; value: unknown }>()
  let instancesDirty = false
  let pinnedNamespace: string | null = namespace ?? null

  let resolveCallback: ((resolutions: Map<string, 'mine' | 'theirs'>) => void) | null = null

  const conflictState = reactive<ConflictState>({
    active: false,
    fields: [],
    resolve(resolutions: Map<string, 'mine' | 'theirs'>) {
      resolveCallback?.(resolutions)
    },
  })

  // Build current state as flat answers (for internal diff)
  function buildState(): AssessmentState {
    const ns = pinnedNamespace || taskStore.activeNamespace
    const completedTasks = Array.from(taskStore.completedRootTaskIds[ns])
      .sort((a, b) => parseInt(a) - parseInt(b))
    return {
      metadata: {
        createdAt: new Date().toISOString(),
        urn: useSchemaStore().getUrn(ns),
        ...(completedTasks.length > 0 && { completedTasks }),
      },
      answers: answerStore.answers[ns] || {},
    }
  }

  // Build state with grouped answers for API persistence
  function buildApiState(): Record<string, unknown> {
    const ns = pinnedNamespace || taskStore.activeNamespace
    const state = buildState()
    const flatTasks = taskStore.flatTasks[ns] || {}
    const apiState: Record<string, unknown> = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: state.metadata,
      answers: Object.keys(flatTasks).length > 0
        ? groupAnswers(state.answers as Record<string, any>, flatTasks, taskStore.taskInstances[ns])
        : state.answers,
    }

    // Preserve pre-scan answers in a separate field so usePreScanReferences
    // can cross-reference them after reload.
    if (ns === FormType.DPIA) {
      const prescanAnswers = answerStore.answers[FormType.PRE_SCAN]
      if (prescanAnswers && Object.keys(prescanAnswers).length > 0) {
        apiState._prescanAnswers = prescanAnswers
      }
    }

    return apiState
  }

  function saveUiState() {
    try {
      const ns = pinnedNamespace || taskStore.activeNamespace
      // Don't overwrite saved section during store reset / initialization
      if (!taskStore.isInitialized[ns]) return
      localStorage.setItem(UI_STORAGE_PREFIX + assessmentId, JSON.stringify({
        currentRootTaskId: taskStore.currentRootTaskId[ns],
      }))
    } catch { /* localStorage may be unavailable */ }
  }

  function restoreUiState() {
    try {
      const raw = localStorage.getItem(UI_STORAGE_PREFIX + assessmentId)
      if (!raw) return
      const uiState = JSON.parse(raw)
      if (uiState.currentRootTaskId) {
        const ns = pinnedNamespace || taskStore.activeNamespace
        taskStore.currentRootTaskId[ns] = uiState.currentRootTaskId
      }
    } catch { /* ignore parse errors */ }
  }

  function updatePendingChanges() {
    if (!lastSavedState) return
    const diff = computeFieldDiff(lastSavedState, buildState())
    pendingChanges.clear()
    for (const [key, change] of diff) {
      pendingChanges.set(key, { key, value: change.newValue })
    }
  }

  async function saveAppState(): Promise<void> {
    try {
      // Guard: don't save if the active namespace has changed (e.g., prescan
      // references temporarily switch namespace). Prevents overwriting data
      // with empty state from a different namespace.
      if (pinnedNamespace && taskStore.activeNamespace !== pinnedNamespace) {
        return
      }

      updatePendingChanges()

      if (pendingChanges.size === 0 && !instancesDirty) {
        return
      }
      if (knownVersion === undefined) {
        return
      }

      const apiState = buildApiState()
      const updated = await assessments.update(assessmentId, apiState, {
        expectedVersion: knownVersion,
      })
      if (updated?.currentVersion) {
        knownVersion = updated.currentVersion
      }
      lastSavedState = JSON.parse(JSON.stringify(buildState()))
      pendingChanges.clear()
      instancesDirty = false
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        persistPendingToSession()
        return
      }
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

    let fresh: Awaited<ReturnType<typeof assessments.get>>
    try {
      fresh = await assessments.get(assessmentId)
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      throw error
    }
    if (!fresh.state) return

    // Normalize server state (keeps grouped format for instance rebuild)
    const serverState = normalizeServerResponse(fresh.state)

    // Flatten for field-level diff comparison (lastSavedState uses flat keys)
    const serverDiff = computeFieldDiff(lastSavedState, flattenForDiff(serverState))

    const conflictKeys = new Set<string>()
    for (const key of pendingChanges.keys()) {
      if (serverDiff.has(key)) {
        const myVal = pendingChanges.get(key)!.value
        const theirVal = serverDiff.get(key)!.newValue
        if (!valuesEqual(myVal, theirVal)) {
          conflictKeys.add(key)
        }
      }
    }

    if (conflictKeys.size === 0) {
      console.info('Auto-merging: no field overlap with server changes')
      applyAppState(serverState)
      replayPendingChanges()
      knownVersion = fresh.currentVersion

      try {
        const mergedState = buildApiState()
        const updated = await assessments.update(assessmentId, mergedState, {
          expectedVersion: knownVersion,
        })
        if (updated?.currentVersion) {
          knownVersion = updated.currentVersion
        }
        lastSavedState = JSON.parse(JSON.stringify(buildState()))
        pendingChanges.clear()
      } catch (retryError) {
        if (retryError instanceof SessionExpiredError) return
        if (retryError instanceof ApiError && retryError.status === 409) {
          await handleConflict()
        } else {
          console.error('Failed to save merged state:', retryError)
        }
      }
      return
    }

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
      applyAppState(serverState)
      replayPendingChanges(conflictKeys)

      for (const [fieldId, choice] of resolutions) {
        if (choice === 'mine') {
          const pending = pendingChanges.get(fieldId)
          if (pending) applyFieldChange(pending.key, pending.value)
        }
      }

      knownVersion = fresh.currentVersion
      conflictState.active = false

      try {
        const resolvedState = buildApiState()
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

    conflictState.active = false
    conflictState.fields = fields
    await nextTick()
    conflictState.active = true
  }

  function replayPendingChanges(excludeKeys?: Set<string>) {
    for (const [fieldId, change] of pendingChanges) {
      if (excludeKeys?.has(fieldId)) continue
      applyFieldChange(change.key, change.value)
    }
  }

  function applyFieldChange(key: string, value: unknown) {
    const ns = taskStore.activeNamespace
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
   * Normalize a server response to the unified AssessmentState format.
   * Handles old namespace-keyed format and new flat format.
   * Returns answers in their original format (grouped arrays preserved)
   * so that rebuildRepeatableInstances can discover empty instances.
   */
  function normalizeServerResponse(serverData: any): AssessmentState {
    if (!serverData?.metadata) {
      return { metadata: { createdAt: new Date().toISOString() }, answers: {} }
    }

    const schemaStore = useSchemaStore()
    const urnLookup: Record<string, string> = {}
    try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* */ }
    try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* */ }

    const migrated = migrateStateV1toV2(serverData as any, urnLookup)

    const answers = (migrated as any).answers || {}
    const metadata = migrated.metadata || {} as any
    const ns = taskStore.activeNamespace

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

    return {
      metadata: {
        urn: metadata.urn,
        createdAt: metadata.createdAt,
        ...(completedTasks.length > 0 && { completedTasks }),
      },
      answers: resolvedAnswers,
    }
  }

  /** Flatten grouped answers to flat instance-keyed format for field-level diffing. */
  function flattenForDiff(state: AssessmentState): AssessmentState {
    const answers = state.answers || {}
    const hasGrouped = Object.values(answers).some(v => Array.isArray(v))
    return hasGrouped
      ? { ...state, answers: flattenGroupedAnswers(answers as Record<string, GroupedAnswerValue>) }
      : state
  }

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
    if (fieldId.startsWith('completed.')) return fieldId
    const parsed = parseInstanceId(fieldId)
    const task = taskStore.getTaskByIdFromNamespace(taskStore.activeNamespace, parsed.taskId)

    if (task?.task) {
      const plain = getPlainTextWithoutDefinitions(task.task)
      const label = plain.length > 80 ? plain.substring(0, 77) + '...' : plain
      return task.is_official_id ? `${task.id}. ${label}` : label
    }
    return fieldId
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
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  async function loadAppState(namespace: FormType): Promise<AssessmentState | null> {
    try {
      // Pin the namespace at first load — all subsequent saves, UI state,
      // and state builds will use this namespace regardless of temporary
      // switches (e.g., prescan reference initialization).
      if (!pinnedNamespace) {
        pinnedNamespace = taskStore.activeNamespace
      }

      const form = await assessments.get(assessmentId)
      knownVersion = form.currentVersion

      if (form.state && Object.keys(form.state).length > 0) {
        return normalizeServerResponse(form.state)
      }

      // New/empty assessment
      lastSavedState = { metadata: { createdAt: new Date().toISOString() }, answers: {} }
    } catch (error) {
      console.error('Failed to load form state from API:', error)
    }
    return null
  }

  function applyAppState(state: AssessmentState): void {
    applyStateToStores(state, taskStore, answerStore)
  }

  async function clearSavedState(namespace: FormType): Promise<void> {
    try {
      await assessments.update(assessmentId, {
        metadata: { createdAt: new Date().toISOString() },
        answers: {},
      })
      localStorage.removeItem(UI_STORAGE_PREFIX + assessmentId)
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
      [() => taskStore.completedRootTaskIds, () => answerStore.answers],
      triggerSave,
      { deep: true },
    )

    watch(
      () => taskStore.taskInstances,
      () => {
        if (taskStore.isInitialized[taskStore.activeNamespace]) {
          instancesDirty = true
          debouncedSave()
        }
      },
      { deep: true },
    )

    watch(
      () => taskStore.currentRootTaskId,
      () => saveUiState(),
      { deep: true },
    )

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

  function persistPendingToSession() {
    try {
      updatePendingChanges()
      if (pendingChanges.size === 0) return
      const entries = Array.from(pendingChanges.entries())
      sessionStorage.setItem(`pending:${assessmentId}`, JSON.stringify(entries))
    } catch { /* sessionStorage may be unavailable */ }
  }

  function restorePendingFromSession() {
    try {
      const raw = sessionStorage.getItem(`pending:${assessmentId}`)
      if (!raw) return
      sessionStorage.removeItem(`pending:${assessmentId}`)
      const entries: [string, { key: string; value: unknown }][] = JSON.parse(raw)
      for (const [, change] of entries) {
        applyFieldChange(change.key, change.value)
      }
    } catch { /* ignore parse errors */ }
  }

  const persistence: PersistenceProvider = {
    saveAppState,
    loadAppState,
    applyAppState,
    clearSavedState,
    setupWatchers,
    flushSave,
    restoreUiState,
    snapshotBaseline: () => {
      pinnedNamespace = taskStore.activeNamespace
      lastSavedState = JSON.parse(JSON.stringify(buildState()))
      instancesDirty = false
      restorePendingFromSession()
    },
  }

  return { ...persistence, conflictState }
}

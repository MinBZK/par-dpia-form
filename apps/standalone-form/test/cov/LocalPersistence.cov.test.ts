import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
  useAnswerStore,
  useTaskStore,
  useSchemaStore,
  FormType,
  OUTPUT_SCHEMA_URL,
} from '@overheid-assessment/core'
import { createLocalPersistence } from '@/LocalPersistence'

/**
 * Coverage suite for the standalone-form LocalPersistence provider.
 *
 * The provider persists assessment state to localStorage in the unified v2
 * format. These tests exercise every branch: empty vs. populated namespaces,
 * the grouped-vs-flat answer split, legacy/namespaced load formats, the
 * URN lookup that may throw, the watcher gate, the UI-state restore fallback,
 * and every catch block.
 */

const DPIA_URN = 'urn:nl:dpia:3.0'
const PRESCAN_URN = 'urn:nl:prescan:1.0'

function storageKey(ns: string): string {
  return `app_state_${ns}`
}
function uiStorageKey(ns: string): string {
  return `ui_state_${ns}`
}

/** Make schemaStore.getUrn return canned URNs so saveAppState/loadAppState can run. */
function stubUrns(): void {
  const schemaStore = useSchemaStore()
  vi.spyOn(schemaStore, 'getUrn').mockImplementation((ns: FormType) =>
    ns === FormType.DPIA ? DPIA_URN : PRESCAN_URN,
  )
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createLocalPersistence — saveAppState', () => {
  it('saves flat answers verbatim when no flatTasks are present', () => {
    stubUrns()
    const answerStore = useAnswerStore()
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'Inleiding' },
    } as Record<string, unknown>

    const provider = createLocalPersistence()
    provider.saveAppState()

    const raw = localStorage.getItem(storageKey(FormType.DPIA))
    expect(raw).not.toBeNull()
    const state = JSON.parse(raw as string)
    expect(state.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(state.metadata.urn).toBe(DPIA_URN)
    // No completedTasks -> the key is omitted entirely.
    expect('completedTasks' in state.metadata).toBe(false)
    // No flatTasks -> answers pass through as the flat map.
    expect(state.answers).toEqual({ '0.1': { value: 'Inleiding' } })

    // UI state is persisted alongside.
    const ui = JSON.parse(localStorage.getItem(uiStorageKey(FormType.DPIA)) as string)
    expect(ui.currentRootTaskId).toBe('0')
  })

  it('groups answers and includes sorted completedTasks when flatTasks exist', () => {
    stubUrns()
    const answerStore = useAnswerStore()
    const taskStore = useTaskStore()

    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'Naam' },
    } as Record<string, unknown>
    taskStore.flatTasks[FormType.DPIA] = {
      '0.1': {
        id: '0.1',
        task: 'Naam',
        type: ['text_input'],
        parentId: null,
        childrenIds: [],
      },
    } as Record<string, unknown>
    // Out-of-order ids prove the numeric sort runs.
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['2', '0', '10'])

    const provider = createLocalPersistence()
    provider.saveAppState()

    const state = JSON.parse(localStorage.getItem(storageKey(FormType.DPIA)) as string)
    expect(state.metadata.completedTasks).toEqual(['0', '2', '10'])
    // groupAnswers passed through the non-repeatable answer unchanged.
    expect(state.answers['0.1']).toEqual({ value: 'Naam' })
  })

  it('defaults answers/flatTasks to {} when the namespace maps are undefined', () => {
    stubUrns()
    const answerStore = useAnswerStore()
    const taskStore = useTaskStore()
    // Force the `?? {}` (right) branches on L32-33: remove the namespace entries.
    delete (answerStore.answers as Record<string, unknown>)[FormType.DPIA]
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.DPIA]

    const provider = createLocalPersistence()
    provider.saveAppState()

    const state = JSON.parse(localStorage.getItem(storageKey(FormType.DPIA)) as string)
    expect(state.answers).toEqual({})
    expect('completedTasks' in state.metadata).toBe(false)
  })

  it('swallows errors and logs when localStorage.setItem throws', () => {
    stubUrns()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const provider = createLocalPersistence()
    expect(() => provider.saveAppState()).not.toThrow()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to save app state to local storage:',
      expect.any(Error),
    )
    setItem.mockRestore()
  })
})

describe('createLocalPersistence — loadAppState', () => {
  it('returns null when nothing is stored', () => {
    stubUrns()
    const provider = createLocalPersistence()
    expect(provider.loadAppState()).toBeNull()
  })

  it('loads a unified (non-namespaced) v2 state with completedTasks', () => {
    stubUrns()
    const stored = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: {
        createdAt: '2026-01-01T00:00:00Z',
        urn: DPIA_URN,
        completedTasks: ['0', '1'],
      },
      answers: { '0.1': { value: 'Inleiding' } },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    const state = provider.loadAppState()
    expect(state).not.toBeNull()
    expect(state?.metadata.urn).toBe(DPIA_URN)
    expect(state?.metadata.createdAt).toBe('2026-01-01T00:00:00Z')
    expect(state?.metadata.completedTasks).toEqual(['0', '1'])
    expect(state?.answers).toEqual({ '0.1': { value: 'Inleiding' } })
  })

  it('synthesizes createdAt and omits completedTasks when both are absent', () => {
    stubUrns()
    const stored = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: DPIA_URN },
      answers: { '0.1': { value: 'X' } },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    const state = provider.loadAppState()
    expect(state).not.toBeNull()
    // Falls back to a fresh ISO timestamp.
    expect(typeof state?.metadata.createdAt).toBe('string')
    expect(state?.metadata.createdAt).not.toBe('')
    expect('completedTasks' in (state?.metadata ?? {})).toBe(false)
  })

  it('returns null when the resolved answers are empty', () => {
    stubUrns()
    const stored = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: DPIA_URN, createdAt: '2026-01-01T00:00:00Z' },
      answers: {},
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    expect(provider.loadAppState()).toBeNull()
  })

  it('resolves the active namespace from an old namespaced format', () => {
    stubUrns()
    // No $schema and answers wrapped under the namespace key => isNamespaced.
    const stored = {
      metadata: { urn: DPIA_URN, createdAt: '2026-01-01T00:00:00Z' },
      answers: {
        [FormType.DPIA]: { '0.1': { value: 'NS-DPIA' } },
        [FormType.PRE_SCAN]: { '0.1': { value: 'NS-PRE' } },
      },
      taskState: {
        [FormType.DPIA]: { completedRootTaskIds: ['0', '3'] },
      },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    const state = provider.loadAppState()
    expect(state?.answers).toEqual({ '0.1': { value: 'NS-DPIA' } })
    // completedRootTaskIds from legacy taskState wins.
    expect(state?.metadata.completedTasks).toEqual(['0', '3'])
  })

  it('falls back to metadata.completedTasks in namespaced format without taskState', () => {
    stubUrns()
    const stored = {
      metadata: { urn: DPIA_URN, createdAt: '2026-01-01T00:00:00Z', completedTasks: ['7'] },
      answers: {
        [FormType.PRE_SCAN]: { '0.1': { value: 'only-pre' } },
        // active ns (DPIA) is absent -> resolvedAnswers defaults to {}.
      },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    // DPIA answers absent -> {} -> empty -> returns null.
    expect(provider.loadAppState()).toBeNull()
  })

  it('keeps namespaced answers for the active namespace when present', () => {
    stubUrns()
    const stored = {
      metadata: { urn: PRESCAN_URN, createdAt: '2026-01-01T00:00:00Z' },
      answers: {
        [FormType.PRE_SCAN]: { '0.1': { value: 'pre-value' } },
      },
    }
    localStorage.setItem(storageKey(FormType.PRE_SCAN), JSON.stringify(stored))

    const taskStore = useTaskStore()
    taskStore.activeNamespace = FormType.PRE_SCAN

    const provider = createLocalPersistence()
    const state = provider.loadAppState()
    expect(state?.answers).toEqual({ '0.1': { value: 'pre-value' } })
    // No taskState and no metadata.completedTasks -> [] -> key omitted.
    expect('completedTasks' in (state?.metadata ?? {})).toBe(false)
  })

  it('continues when getUrn throws for both namespaces during urnLookup', () => {
    const schemaStore = useSchemaStore()
    // Real getUrn throws because no schema is loaded -> exercises both catch arms.
    expect(() => schemaStore.getUrn(FormType.DPIA)).toThrow()

    const stored = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: DPIA_URN, createdAt: '2026-01-01T00:00:00Z' },
      answers: { '0.1': { value: 'still-loads' } },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(stored))

    const provider = createLocalPersistence()
    const state = provider.loadAppState()
    expect(state?.answers).toEqual({ '0.1': { value: 'still-loads' } })
  })

  it('defaults answers/metadata to {} when the migrated state has neither', () => {
    stubUrns()
    // No `metadata` => migrateStateV1toV2 returns the object unchanged, so the
    // result has no `answers` and no `metadata` => exercises the `|| {}` (right)
    // branches on L73-74. Empty resolved answers => loadAppState returns null.
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify({ unrelated: true }))

    const provider = createLocalPersistence()
    expect(provider.loadAppState()).toBeNull()
  })

  it('swallows errors and logs when stored JSON is invalid', () => {
    stubUrns()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(storageKey(FormType.DPIA), '{ not valid json')

    const provider = createLocalPersistence()
    expect(provider.loadAppState()).toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to load app state from local storage:',
      expect.any(Error),
    )
  })
})

describe('createLocalPersistence — applyAppState', () => {
  it('writes completedTasks and flat answers into the stores', () => {
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()

    const provider = createLocalPersistence()
    provider.applyAppState({
      metadata: { createdAt: '2026-01-01T00:00:00Z', completedTasks: ['0', '1'] },
      answers: { '0.1': { value: 'Toegepast' } },
    })

    expect(Array.from(taskStore.completedRootTaskIds[FormType.DPIA])).toEqual(['0', '1'])
    expect(answerStore.answers[FormType.DPIA]['0.1']).toEqual({ value: 'Toegepast' })
  })
})

describe('createLocalPersistence — clearSavedState', () => {
  it('clears the active namespace when no argument is given', () => {
    localStorage.setItem(storageKey(FormType.DPIA), '{}')
    localStorage.setItem(uiStorageKey(FormType.DPIA), '{}')

    const provider = createLocalPersistence()
    provider.clearSavedState()

    expect(localStorage.getItem(storageKey(FormType.DPIA))).toBeNull()
    expect(localStorage.getItem(uiStorageKey(FormType.DPIA))).toBeNull()
  })

  it('clears an explicitly named namespace', () => {
    localStorage.setItem(storageKey(FormType.PRE_SCAN), '{}')
    localStorage.setItem(uiStorageKey(FormType.PRE_SCAN), '{}')

    const provider = createLocalPersistence()
    provider.clearSavedState(FormType.PRE_SCAN)

    expect(localStorage.getItem(storageKey(FormType.PRE_SCAN))).toBeNull()
    expect(localStorage.getItem(uiStorageKey(FormType.PRE_SCAN))).toBeNull()
  })
})

describe('createLocalPersistence — setupWatchers', () => {
  it('saves on change only once the active namespace is initialized', async () => {
    stubUrns()
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()

    const provider = createLocalPersistence()
    provider.setupWatchers!()

    // Not initialized yet: a change must NOT trigger a save.
    answerStore.answers[FormType.DPIA] = { '0.1': { value: 'eerste' } } as Record<string, unknown>
    await nextTick()
    expect(localStorage.getItem(storageKey(FormType.DPIA))).toBeNull()

    // Now mark initialized and mutate again: the watcher should save.
    taskStore.isInitialized[FormType.DPIA] = true
    answerStore.answers[FormType.DPIA] = { '0.1': { value: 'tweede' } } as Record<string, unknown>
    await nextTick()

    const state = JSON.parse(localStorage.getItem(storageKey(FormType.DPIA)) as string)
    expect(state.answers).toEqual({ '0.1': { value: 'tweede' } })
  })
})

describe('createLocalPersistence — restoreUiState', () => {
  it('restores currentRootTaskId from the UI state key', () => {
    localStorage.setItem(
      uiStorageKey(FormType.DPIA),
      JSON.stringify({ currentRootTaskId: '5' }),
    )

    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    provider.restoreUiState!()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('5')
  })

  it('ignores UI state that lacks currentRootTaskId', () => {
    localStorage.setItem(uiStorageKey(FormType.DPIA), JSON.stringify({ other: 'x' }))

    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    provider.restoreUiState!()

    // Unchanged default.
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('recovers currentRootTaskId from a legacy DPIASnapshot when no UI state exists', () => {
    const legacy = {
      taskState: { [FormType.DPIA]: { currentRootTaskId: '9' } },
    }
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify(legacy))

    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    provider.restoreUiState!()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('9')
  })

  it('leaves the default when no UI state and no legacy task id exist', () => {
    // app_state present but without a legacy currentRootTaskId.
    localStorage.setItem(storageKey(FormType.DPIA), JSON.stringify({ answers: {} }))

    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    provider.restoreUiState!()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('does nothing when neither UI state nor app state are stored', () => {
    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    provider.restoreUiState!()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('silently ignores invalid JSON in the app_state fallback', () => {
    localStorage.setItem(storageKey(FormType.DPIA), '{ broken json')

    const taskStore = useTaskStore()
    const provider = createLocalPersistence()
    expect(() => provider.restoreUiState!()).not.toThrow()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })
})

/**
 * @vitest-environment jsdom
 *
 * Self-sufficient coverage suite for src/ApiPersistence.ts.
 *
 * createApiPersistence wires the Pinia task/answer/schema stores to the
 * assessments REST API and implements collaborative-sync conflict handling.
 * The ./api module is mocked so we can drive every save/load/conflict path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  useTaskStore,
  useAnswerStore,
  useSchemaStore,
  FormType,
} from '@overheid-assessment/core'

// — Mock the API module. ApiError/SessionExpiredError must be real classes so
//   `instanceof` checks inside ApiPersistence behave correctly. —
const mockGet = vi.fn()
const mockUpdate = vi.fn()

class MockApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
class MockSessionExpiredError extends Error {
  constructor() {
    super('Sessie verlopen')
    this.name = 'SessionExpiredError'
  }
}

vi.mock('../../src/api', () => ({
  assessments: {
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  ApiError: MockApiError,
  SessionExpiredError: MockSessionExpiredError,
}))

// Minimal DPIA / Pre-scan schema fixtures with a parent → child → grandchild
// chain plus a repeatable parent, so getRootTaskForField can walk the tree.
function buildSchema(urn: string) {
  return {
    name: 'Test',
    urn,
    version: '3.0',
    description: 'Test schema',
    tasks: [
      {
        id: '0',
        task: 'Inleiding',
        type: ['task_group'],
        is_official_id: false,
        tasks: [
          { id: '0.1', task: 'Titel van de verwerking', type: ['text_input'], is_official_id: true },
        ],
      },
      {
        id: '1',
        task: 'Beschrijving',
        type: ['task_group'],
        is_official_id: false,
        tasks: [
          { id: '1.1', task: 'Beschrijf de verwerking', type: ['open_text'], is_official_id: true },
        ],
      },
      {
        id: '2',
        task: 'Persoonsgegevens',
        type: ['task_group'],
        is_official_id: false,
        tasks: [
          {
            id: '2.1',
            task: 'Categorieën',
            type: ['task_group'],
            repeatable: true,
            is_official_id: true,
            tasks: [
              { id: '2.1.1', task: 'Soort gegeven', type: ['text_input'], is_official_id: true },
              { id: '2.1.2', task: 'Betrokkenen', type: ['text_input'], is_official_id: true },
            ],
          },
        ],
      },
    ],
  }
}

function initStores() {
  const schemaStore = useSchemaStore()
  // init() pushes an extra "Afronding"/"Resultaat" conclusion task — harmless
  // for our purposes; we only rely on getUrn + the tasks we reference.
  schemaStore.init({ dpia: buildSchema('urn:nl:dpia:3.0'), preScan: buildSchema('urn:nl:prescan:1.0') })

  const taskStore = useTaskStore()
  taskStore.setActiveNamespace(FormType.DPIA)
  taskStore.init(buildSchema('urn:nl:dpia:3.0').tasks as never)
  taskStore.isInitialized[FormType.DPIA] = true

  const answerStore = useAnswerStore()
  answerStore.setActiveNamespace(FormType.DPIA)

  return { schemaStore, taskStore, answerStore }
}

function getResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    currentVersion: 1,
    updatedAt: '2026-04-12T12:00:00.000Z',
    state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: {} },
    ...overrides,
  }
}

// Convenience to import the module under test fresh each time so the mock
// is wired before the import is evaluated.
async function loadModule() {
  return import('../../src/ApiPersistence')
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockGet.mockReset()
  mockUpdate.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('createApiPersistence — shape', () => {
  it('returns persistence provider, conflictState and sync', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')

    expect(typeof p.saveAppState).toBe('function')
    expect(typeof p.loadAppState).toBe('function')
    expect(typeof p.applyAppState).toBe('function')
    expect(typeof p.clearSavedState).toBe('function')
    expect(typeof p.setupWatchers).toBe('function')
    expect(typeof p.flushSave).toBe('function')
    expect(typeof p.restoreUiState).toBe('function')
    expect(typeof p.snapshotBaseline).toBe('function')
    expect(p.conflictState.active).toBe(false)
    expect(p.sync.knownVersion.value).toBeUndefined()
    expect(p.sync.hasDeferredChanges()).toBe(false)
  })

  it('accepts an explicit namespace argument (pinnedNamespace branch)', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    // namespace provided → pinnedNamespace = namespace (not null)
    const p = createApiPersistence('a1', FormType.DPIA)
    expect(p).toBeDefined()
  })
})

describe('loadAppState', () => {
  it('loads server state and tracks version / updatedAt', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 5, updatedAt: '2026-04-12T14:00:00.000Z' }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)

    expect(state).not.toBeNull()
    expect(p.sync.knownVersion.value).toBe(5)
    expect(p.sync.knownUpdatedAt.value).toBe('2026-04-12T14:00:00.000Z')
  })

  it('pins the active namespace when none was provided', async () => {
    const { taskStore } = initStores()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    mockGet.mockResolvedValueOnce(getResponse({
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:1.0' }, answers: {} },
    }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.PRE_SCAN)
    expect(mockGet).toHaveBeenCalledWith('a1')
  })

  it('does not re-pin when namespace was supplied to the factory', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse())
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.DPIA)
    const state = await p.loadAppState(FormType.DPIA)
    expect(state).not.toBeNull()
  })

  it('returns null and sets empty baseline for a new/empty assessment', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ state: {} }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state).toBeNull()
  })

  it('returns null when state is undefined (falsy)', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ state: undefined }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state).toBeNull()
  })

  it('logs and returns null when the API throws', async () => {
    initStores()
    mockGet.mockRejectedValueOnce(new Error('netwerkfout'))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('normalizeServerResponse (via loadAppState)', () => {
  it('returns empty state when server data has no metadata', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ state: { answers: { '1.1': { value: 'x' } } } }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    // No metadata → normalize returns blank answers
    expect(state).toEqual({ metadata: { createdAt: expect.any(String) }, answers: {} })
  })

  it('handles the old namespace-wrapped answers format', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { [FormType.DPIA]: { '1.1': { value: 'genest' } }, [FormType.PRE_SCAN]: {} },
        taskState: { [FormType.DPIA]: { completedRootTaskIds: ['0'] } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers['1.1']).toEqual({ value: 'genest' })
    expect(state!.metadata.completedTasks).toEqual(['0'])
  })

  it('handles namespaced format falling back to metadata.completedTasks', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0', completedTasks: ['1'] },
        // namespaced but missing the active namespace key → resolvedAnswers = {}
        answers: { [FormType.PRE_SCAN]: { '0.1': { value: 'p' } } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers).toEqual({})
    expect(state!.metadata.completedTasks).toEqual(['1'])
  })

  it('handles the flat (non-namespaced) format with completedTasks', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0', completedTasks: ['0', '1'] },
        answers: { '1.1': { value: 'plat' } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers['1.1']).toEqual({ value: 'plat' })
    expect(state!.metadata.completedTasks).toEqual(['0', '1'])
  })

  it('omits completedTasks when none are present (flat format)', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'plat' } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect('completedTasks' in state!.metadata).toBe(false)
  })

  it('still works when the schema store has no URN for a namespace (getUrn throws)', async () => {
    // Fresh pinia where schema store init is skipped → getUrn throws, caught
    setActivePinia(createPinia())
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.DPIA)
    useSchemaStore() // not initialized → getUrn(DPIA/PRESCAN) throws inside try/catch

    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'x' } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.DPIA)
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers['1.1']).toEqual({ value: 'x' })
  })
})

describe('applyAppState', () => {
  it('applies state to the stores', async () => {
    const { answerStore, taskStore } = initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')

    p.applyAppState({
      metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0', completedTasks: ['0'] },
      answers: { '1.1': { value: 'toegepast' } as never },
    })

    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'toegepast' })
    expect(taskStore.completedRootTaskIds[FormType.DPIA].has('0')).toBe(true)
  })
})

describe('snapshotBaseline + restorePendingFromSession', () => {
  it('captures a baseline and restores pending session changes', async () => {
    const { answerStore } = initStores()
    sessionStorage.setItem('pending:a1', JSON.stringify([
      ['1.1', { key: '1.1', value: { value: 'uit sessie' } }],
      ['completed.0', { key: 'completed.0', value: true }],
      ['del', { key: 'del', value: null }],
    ]))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    p.snapshotBaseline()

    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'uit sessie' })
    // null value path: delete (no-op when absent, here it just stays absent)
    expect(answerStore.answers[FormType.DPIA]['del']).toBeUndefined()
  })

  it('ignores malformed session JSON', async () => {
    initStores()
    sessionStorage.setItem('pending:a1', '{not json')
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.snapshotBaseline()).not.toThrow()
  })

  it('returns early when no pending session entry exists', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.snapshotBaseline()).not.toThrow()
  })
})

describe('saveUiState / restoreUiState (via setupWatchers)', () => {
  it('saves currentRootTaskId to localStorage when initialized', async () => {
    const { taskStore } = initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const teardown = p.setupWatchers()

    taskStore.currentRootTaskId[FormType.DPIA] = '2'
    await nextTick()

    const raw = localStorage.getItem('ui:a1')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).currentRootTaskId).toBe('2')
    teardown()
  })

  it('does not save UI state when the namespace is not initialized', async () => {
    const { taskStore } = initStores()
    taskStore.isInitialized[FormType.DPIA] = false
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const teardown = p.setupWatchers()

    taskStore.currentRootTaskId[FormType.DPIA] = '2'
    await nextTick()

    expect(localStorage.getItem('ui:a1')).toBeNull()
    teardown()
  })

  it('restoreUiState applies saved currentRootTaskId', async () => {
    const { taskStore } = initStores()
    localStorage.setItem('ui:a1', JSON.stringify({ currentRootTaskId: '1' }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    p.restoreUiState()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('1')
  })

  it('restoreUiState returns early when nothing saved', async () => {
    const { taskStore } = initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    p.restoreUiState()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('restoreUiState ignores empty currentRootTaskId', async () => {
    initStores()
    localStorage.setItem('ui:a1', JSON.stringify({ currentRootTaskId: '' }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.restoreUiState()).not.toThrow()
  })

  it('restoreUiState ignores malformed JSON', async () => {
    initStores()
    localStorage.setItem('ui:a1', '{bad')
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.restoreUiState()).not.toThrow()
  })
})

describe('setupWatchers — answers / instances / visibility / teardown', () => {
  it('schedules a debounced save when answers change', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse())
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'gewijzigd', lastEditedAt: 't' }
    await nextTick()
    await vi.runAllTimersAsync()

    expect(mockUpdate).toHaveBeenCalled()
    teardown()
  })

  it('does not schedule a save when the namespace is not initialized', async () => {
    vi.useFakeTimers()
    const { answerStore, taskStore } = initStores()
    taskStore.isInitialized[FormType.DPIA] = false

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    await Promise.resolve()
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    expect(mockUpdate).not.toHaveBeenCalled()
    teardown()
  })

  it('marks instances dirty and saves when taskInstances change (initialized)', async () => {
    vi.useFakeTimers()
    const { taskStore } = initStores()
    mockGet.mockResolvedValue(getResponse())
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    const teardown = p.setupWatchers()

    taskStore.addRepeatableTaskInstance('2.1')
    await nextTick()
    await vi.runAllTimersAsync()

    expect(mockUpdate).toHaveBeenCalled()
    teardown()
  })

  it('does not mark instances dirty when not initialized', async () => {
    vi.useFakeTimers()
    const { taskStore } = initStores()
    taskStore.isInitialized[FormType.DPIA] = false

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const teardown = p.setupWatchers()

    taskStore.taskInstances[FormType.DPIA]['ghost'] = {
      id: 'ghost', taskId: 'x', groupId: 'g', parentInstanceId: null, childInstanceIds: [],
    }
    await Promise.resolve()
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    expect(mockUpdate).not.toHaveBeenCalled()
    teardown()
  })

  it('flushes a pending debounce on visibilitychange=hidden and saves', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse())
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'zichtbaarheid', lastEditedAt: 't' }
    await nextTick() // let the deep watcher fire and schedule the debounce

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()

    expect(mockUpdate).toHaveBeenCalled()
    teardown()
  })

  it('ignores visibilitychange when there is no pending debounce', async () => {
    vi.useFakeTimers()
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const teardown = p.setupWatchers()

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.runAllTimersAsync()

    expect(mockUpdate).not.toHaveBeenCalled()
    teardown()
  })

  it('teardown clears a pending debounce timer', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse())

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'pending', lastEditedAt: 't' }
    await Promise.resolve()
    teardown() // clears the timer before it fires
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('flushSave', () => {
  it('cancels a scheduled debounce', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse())

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    await Promise.resolve()
    p.flushSave()
    vi.advanceTimersByTime(500)
    await vi.runAllTimersAsync()

    expect(mockUpdate).not.toHaveBeenCalled()
    teardown()
  })

  it('is a no-op when nothing is scheduled', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.flushSave()).not.toThrow()
  })
})

describe('clearSavedState', () => {
  it('clears server state and localStorage', async () => {
    initStores()
    localStorage.setItem('ui:a1', JSON.stringify({ currentRootTaskId: '2' }))
    mockUpdate.mockResolvedValueOnce(getResponse())
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.clearSavedState(FormType.DPIA)
    expect(mockUpdate).toHaveBeenCalledWith('a1', { metadata: { createdAt: expect.any(String) }, answers: {} })
    expect(localStorage.getItem('ui:a1')).toBeNull()
  })

  it('logs when clearing fails', async () => {
    initStores()
    mockUpdate.mockRejectedValueOnce(new Error('boom'))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.clearSavedState(FormType.DPIA)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('saveAppState — early returns', () => {
  it('returns early when active namespace differs from pinned namespace', async () => {
    const { taskStore } = initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.DPIA)
    taskStore.setActiveNamespace(FormType.PRE_SCAN) // now differs from pinned DPIA
    await p.saveAppState()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns early when there are no pending changes and instances are clean', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 3 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    await p.saveAppState()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns early when knownVersion is undefined (never loaded)', async () => {
    const { answerStore } = initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    p.snapshotBaseline()
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'verandering', lastEditedAt: 't' }
    await p.saveAppState()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('saveAppState — success path', () => {
  it('persists pending changes and updates known version', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 4 }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 5 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'nieuw antwoord', lastEditedAt: 't' }
    await p.saveAppState()

    expect(mockUpdate).toHaveBeenCalledWith('a1', expect.objectContaining({ $schema: expect.any(String) }), { expectedVersion: 4 })
    expect(p.sync.knownVersion.value).toBe(5)
  })

  it('saves when only instances are dirty (no field changes)', async () => {
    vi.useFakeTimers()
    const { taskStore } = initStores()
    mockGet.mockResolvedValue(getResponse({ currentVersion: 1 }))
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    taskStore.addRepeatableTaskInstance('2.1') // instancesDirty = true, no field change
    await nextTick()
    await vi.runAllTimersAsync()

    expect(mockUpdate).toHaveBeenCalled()
    teardown()
  })

  it('handles a server update that does not return a new version', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 4 }))
    mockUpdate.mockResolvedValueOnce(undefined) // no currentVersion in response

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'antwoord', lastEditedAt: 't' }
    await p.saveAppState()
    // knownVersion stays at the loaded value because update returned nothing
    expect(p.sync.knownVersion.value).toBe(4)
  })

  it('includes _prescanAnswers when the active namespace is DPIA and prescan data exists', async () => {
    const { answerStore } = initStores()
    answerStore.answers[FormType.PRE_SCAN]['0.1'] = { value: 'prescan waarde', lastEditedAt: 't' }
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'nieuw', lastEditedAt: 't' }
    await p.saveAppState()

    const payload = mockUpdate.mock.calls[0][1]
    expect(payload._prescanAnswers).toEqual({ '0.1': { value: 'prescan waarde', lastEditedAt: 't' } })
  })

  it('builds grouped answers for repeatable tasks (buildApiState groupAnswers branch)', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['2.1.1[0]'] = { value: 'E-mail', lastEditedAt: 't' }
    await p.saveAppState()

    const payload = mockUpdate.mock.calls[0][1]
    expect(Array.isArray(payload.answers['2.1'])).toBe(true)
  })

  it('emits completedTasks in metadata when tasks are completed', async () => {
    const { taskStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1', '0'])
    await p.saveAppState()

    const payload = mockUpdate.mock.calls[0][1]
    expect(payload.metadata.completedTasks).toEqual(['0', '1'])
  })
})

describe('saveAppState — error handling', () => {
  it('persists pending to session on SessionExpiredError', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockRejectedValueOnce(new MockSessionExpiredError())

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'verloren sessie', lastEditedAt: 't' }
    await p.saveAppState()

    const raw = sessionStorage.getItem('pending:a1')
    expect(raw).not.toBeNull()
    expect(raw).toContain('1.1')
  })

  it('logs an unexpected non-409 ApiError', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockRejectedValueOnce(new MockApiError('Serverfout', 500))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    await p.saveAppState()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs a generic (non-API) error', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    mockUpdate.mockRejectedValueOnce(new Error('iets ging mis'))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    await p.saveAppState()
    expect(console.error).toHaveBeenCalledWith('Failed to save form state to API:', expect.any(Error))
  })
})

describe('handleConflict (409) — auto-merge (no field overlap)', () => {
  it('auto-merges when the colleague changed a different field', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // user edits 1.1
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn wijziging', lastEditedAt: 't' }

    // first update → 409, then GET returns server state with a *different* field changed
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '0.1': { value: 'collega veld' } },
      },
    }))
    // retry update succeeds
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 10 }))

    await p.saveAppState()

    expect(p.conflictState.active).toBe(false)
    expect(p.sync.knownVersion.value).toBe(10)
    expect(answerStore.answers[FormType.DPIA]['0.1']).toEqual({ value: 'collega veld' })
    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'mijn wijziging', lastEditedAt: 't' })
  })

  it('returns early during conflict when server has no state', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({ state: null }))

    await p.saveAppState()
    expect(p.conflictState.active).toBe(false)
  })

  it('aborts conflict handling when the conflict GET fails with SessionExpiredError', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockRejectedValueOnce(new MockSessionExpiredError())

    await p.saveAppState()
    expect(p.conflictState.active).toBe(false)
  })

  it('rethrows when the conflict GET fails with a non-session error', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockRejectedValueOnce(new Error('GET kapot'))

    // handleConflict rethrows the non-session error; it is invoked from
    // saveAppState's catch block (`await handleConflict()`) and therefore
    // propagates out of saveAppState unhandled.
    await expect(p.saveAppState()).rejects.toThrow('GET kapot')
  })

  it('clears a pending debounce timer on conflict', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'x', lastEditedAt: 't' }
    await nextTick() // deep watcher fires → schedules a debounce (debounceTimer set)

    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 10 }))

    await p.saveAppState() // enters handleConflict with a live debounceTimer → cleared
    await vi.runAllTimersAsync()

    expect(p.conflictState.active).toBe(false)
    teardown()
  })

  it('handles update returning no version during auto-merge', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    mockUpdate.mockResolvedValueOnce(undefined) // retry returns no version

    await p.saveAppState()
    expect(p.sync.knownVersion.value).toBe(9) // stays at fresh.currentVersion
  })
})

describe('handleConflict (409) — auto-merge retry failures', () => {
  it('aborts when the merged-state retry fails with SessionExpiredError', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    mockUpdate.mockRejectedValueOnce(new MockSessionExpiredError())

    await p.saveAppState()
    expect(p.conflictState.active).toBe(false)
  })

  it('recurses into handleConflict when the merged-state retry returns 409 again', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }

    // 1st update → 409
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    // 1st conflict GET → server changed a different field
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    // retry update → 409 again → recurse
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    // 2nd conflict GET → no further changes (serverDiff overlaps? -> still different field)
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 11,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    // 2nd retry update → success
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 12 }))

    await p.saveAppState()
    expect(p.sync.knownVersion.value).toBe(12)
  })

  it('logs when the merged-state retry fails with a generic error', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'ander' } } },
    }))
    mockUpdate.mockRejectedValueOnce(new Error('retry kapot'))

    await p.saveAppState()
    expect(console.error).toHaveBeenCalledWith('Failed to save merged state:', expect.any(Error))
  })
})

describe('handleConflict (409) — true conflict → dialog + resolution', () => {
  async function setupConflict() {
    const { answerStore, taskStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // user changes 1.1 AND completes section 1
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn tekst', lastEditedAt: 't' }
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])

    // 409, then GET returns a conflicting value on the SAME field 1.1 plus a list
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'collega tekst' } },
      },
    }))
    await p.saveAppState()
    await nextTick()
    return { p, answerStore, taskStore }
  }

  it('opens the conflict dialog with formatted fields', async () => {
    const { p } = await setupConflict()
    expect(p.conflictState.active).toBe(true)
    expect(p.conflictState.fields.length).toBeGreaterThan(0)
    const field = p.conflictState.fields.find(f => f.fieldId === '1.1')!
    expect(field).toBeDefined()
    expect(field.label).toContain('1.1') // is_official_id task → "1.1. ..."
    expect(field.myFormatted).toContain('mijn tekst')
    expect(field.theirFormatted).toContain('collega tekst')
  })

  it('resolves choosing "mine" and persists the resolved state', async () => {
    const { p, answerStore } = await setupConflict()
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 12 }))

    p.conflictState.resolve(new Map([['1.1', 'mine']]))
    await nextTick()
    await Promise.resolve()

    expect(p.conflictState.active).toBe(false)
    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'mijn tekst', lastEditedAt: 't' })
  })

  it('resolves choosing "theirs"', async () => {
    const { p, answerStore } = await setupConflict()
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 12 }))

    p.conflictState.resolve(new Map([['1.1', 'theirs']]))
    await nextTick()
    await Promise.resolve()

    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'collega tekst' })
    expect(p.sync.knownVersion.value).toBe(12)
  })

  it('handles update returning no version during resolution', async () => {
    const { p } = await setupConflict()
    mockUpdate.mockResolvedValueOnce(undefined)
    p.conflictState.resolve(new Map([['1.1', 'mine']]))
    await nextTick()
    await Promise.resolve()
    expect(p.sync.knownVersion.value).toBe(9) // stays at fresh.currentVersion
  })

  it('recurses into handleConflict when the resolution save returns 409', async () => {
    const { p } = await setupConflict()
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    // recursion: GET fresh, no overlap → auto-merge path → update succeeds
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 20,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'iets anders' } } },
    }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 21 }))

    p.conflictState.resolve(new Map([['1.1', 'mine']]))
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(p.sync.knownVersion.value).toBe(21)
  })

  it('logs when the resolution save fails with a generic error', async () => {
    const { p } = await setupConflict()
    mockUpdate.mockRejectedValueOnce(new Error('resolve kapot'))

    p.conflictState.resolve(new Map([['1.1', 'mine']]))
    await nextTick()
    await Promise.resolve()

    expect(console.error).toHaveBeenCalledWith('Failed to save resolved state:', expect.any(Error))
  })

  it('resolve() is a no-op when there is no pending resolveCallback', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    // resolveCallback is null → resolve() optional-chains to nothing
    expect(() => p.conflictState.resolve(new Map())).not.toThrow()
  })
})

describe('handleRemoteChange', () => {
  async function loaded() {
    const fixtures = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    return { p, ...fixtures }
  }

  it('returns empty result when a conflict dialog is already open', async () => {
    const { p, answerStore, taskStore } = await loaded()

    // Force a conflict dialog open first.
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'collega' } } },
    }))
    await p.saveAppState()
    await nextTick()
    expect(p.conflictState.active).toBe(true)

    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(0)
    expect(result.activeSectionChanges).toEqual([])
  })

  it('syncs versions only when there is no content diff', async () => {
    const { p } = await loaded()
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 7,
      updatedAt: '2026-04-12T15:00:00.000Z',
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: {} },
    }))

    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(0)
    expect(p.sync.knownVersion.value).toBe(7)
    expect(p.sync.knownUpdatedAt.value).toBe('2026-04-12T15:00:00.000Z')
  })

  it('returns empty result and aborts when fetch throws SessionExpiredError', async () => {
    const { p } = await loaded()
    mockGet.mockRejectedValueOnce(new MockSessionExpiredError())
    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(0)
  })

  it('rethrows when the fetch throws a non-session error', async () => {
    const { p } = await loaded()
    mockGet.mockRejectedValueOnce(new Error('netwerk kapot'))
    await expect(p.sync.handleRemoteChange('1')).rejects.toThrow('netwerk kapot')
  })

  it('returns empty result when fresh state is absent', async () => {
    const { p } = await loaded()
    mockGet.mockResolvedValueOnce(getResponse({ state: null }))
    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(0)
  })

  it('merges background-section changes immediately and defers active-section changes', async () => {
    const { p } = await loaded()
    // section 0 field (0.1) is background, section 1 field (1.1) is active
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      updatedAt: '2026-04-12T16:00:00.000Z',
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '0.1': { value: 'achtergrond' }, '1.1': { value: 'actief' } },
      },
    }))

    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(1)
    expect(result.backgroundSectionLabels.length).toBe(1)
    expect(result.activeSectionChanges.length).toBe(1)
    expect(result.activeSectionFieldLabels.length).toBe(1)
    expect(p.sync.hasDeferredChanges()).toBe(true)
    expect(p.sync.knownVersion.value).toBe(8)
  })

  it('rebuilds the baseline so no spurious save is re-triggered after a background merge', async () => {
    vi.useFakeTimers()
    const { p, answerStore } = await loaded()
    const teardown = p.setupWatchers()

    // local pending change on 1.1 (active section)
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn lokaal', lastEditedAt: 't' }
    await Promise.resolve()

    // remote change only on background field 0.1 → after merge, lastSavedState is
    // rebuilt from the current store (which already contains my 1.1 edit), so
    // updatePendingChanges yields no pending changes and no save is re-triggered.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '0.1': { value: 'achtergrond' } },
      },
    }))
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 9 }))

    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(1)
    await vi.runAllTimersAsync()
    expect(mockUpdate).not.toHaveBeenCalled()
    teardown()
  })

  it('treats a completed-task change as a section change (getRootTaskForField completed branch)', async () => {
    const { p } = await loaded()
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0', completedTasks: ['1'] },
        answers: {},
      },
    }))
    // completed.1 → rootTask "1" === activeSectionId "1" → active section change
    const result = await p.sync.handleRemoteChange('1')
    expect(result.activeSectionChanges.some(c => c.fieldId === 'completed.1')).toBe(true)
  })

  it('handles an unknown field id against an empty (PRE_SCAN) task map', async () => {
    // PRE_SCAN namespace has an empty-but-defined flatTasks map. getRootTaskForField
    // parses the id, the parent-walk loop body never runs (no task), so it returns
    // the field id itself as the "root".
    initStores()
    const taskStore = useTaskStore()
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 1,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:1.0' }, answers: {} },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.PRE_SCAN)
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    await p.loadAppState(FormType.PRE_SCAN)
    p.snapshotBaseline()

    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:1.0' },
        answers: { '9.9': { value: 'onbekend veld' } },
      },
    }))
    const result = await p.sync.handleRemoteChange('does-not-match')
    expect(result.backgroundMerged).toBe(1)
    // root "9.9" has no task → getSectionLabel falls back to the id
    expect(result.backgroundSectionLabels).toEqual(['9.9'])
  })

  it('walks the parent chain to find the root for a nested field', async () => {
    const { p } = await loaded()
    // 2.1.1[0] → parent 2.1 → parent 2 (root). With activeSectionId "9" it lands in background.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'genest' } }] },
      },
    }))
    const result = await p.sync.handleRemoteChange('9')
    expect(result.backgroundMerged).toBe(1)
    // background section "2" label should be present
    expect(result.backgroundSectionLabels.length).toBe(1)
  })
})

describe('applyDeferredChanges + applyDeferredOnNavigate + hasDeferredChanges', () => {
  async function loadedWithDeferred(activeFieldValue = 'collega actief') {
    const fixtures = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Remote change on active section 1 (field 1.1) → deferred
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      updatedAt: '2026-04-12T16:00:00.000Z',
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: activeFieldValue } },
      },
    }))
    const result = await p.sync.handleRemoteChange('1')
    return { p, result, ...fixtures }
  }

  it('returns merged when no deferred changes exist', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(await p.sync.applyDeferredChanges()).toBe('merged')
  })

  it('returns stale when changeId does not match', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(await p.sync.applyDeferredChanges(999)).toBe('stale')
  })

  it('applies deferred changes (no conflict) and schedules a save', async () => {
    vi.useFakeTimers()
    const { p, result, answerStore } = await loadedWithDeferred()
    expect(p.sync.hasDeferredChanges()).toBe(true)
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 9 }))

    const outcome = await p.sync.applyDeferredChanges(result.changeId)
    expect(outcome).toBe('merged')
    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'collega actief' })
    expect(p.sync.knownVersion.value).toBe(8)
    await vi.runAllTimersAsync()
    expect(p.sync.hasDeferredChanges()).toBe(false)
  })

  it('opens the conflict dialog when the user changed the same deferred field differently', async () => {
    const { p, result, answerStore } = await loadedWithDeferred('collega waarde')
    // user locally changes the SAME field to something different
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn waarde', lastEditedAt: 't' }

    const outcome = await p.sync.applyDeferredChanges(result.changeId)
    await nextTick()
    expect(outcome).toBe('conflict')
    expect(p.conflictState.active).toBe(true)
    expect(p.conflictState.fields.some(f => f.fieldId === '1.1')).toBe(true)
  })

  it('merges deferred when the user changed the same field to the SAME value (no conflict)', async () => {
    vi.useFakeTimers()
    const { p, result, answerStore } = await loadedWithDeferred('zelfde waarde')
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'zelfde waarde' }
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 9 }))

    const outcome = await p.sync.applyDeferredChanges(result.changeId)
    expect(outcome).toBe('merged')
    await vi.runAllTimersAsync()
    teardownTimers()
  })

  it('resolves a deferred conflict via the dialog (mine)', async () => {
    const { p, result, answerStore } = await loadedWithDeferred('collega waarde')
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn waarde', lastEditedAt: 't' }
    await p.sync.applyDeferredChanges(result.changeId)
    await nextTick()
    expect(p.conflictState.active).toBe(true)

    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 20 }))
    p.conflictState.resolve(new Map([['1.1', 'mine']]))
    await nextTick()
    await Promise.resolve()

    expect(p.conflictState.active).toBe(false)
    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'mijn waarde', lastEditedAt: 't' })
    expect(p.sync.knownVersion.value).toBe(8) // deferredVersion
  })

  it('resolves a deferred conflict via the dialog (theirs)', async () => {
    const { p, result, answerStore } = await loadedWithDeferred('collega waarde')
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn waarde', lastEditedAt: 't' }
    await p.sync.applyDeferredChanges(result.changeId)
    await nextTick()

    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 20 }))
    p.conflictState.resolve(new Map([['1.1', 'theirs']]))
    await nextTick()
    await Promise.resolve()

    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'collega waarde' })
  })

  it('guards against concurrent invocations (applyingDeferred)', async () => {
    const { p, result } = await loadedWithDeferred()
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 9 }))
    // fire two invocations; the second should see applyingDeferred and return stale
    const first = p.sync.applyDeferredChanges(result.changeId)
    const second = p.sync.applyDeferredChanges(result.changeId)
    const [, r2] = await Promise.all([first, second])
    expect(r2).toBe('stale')
  })

  it('applyDeferredOnNavigate silently applies deferred changes', async () => {
    const { p, answerStore } = await loadedWithDeferred()
    expect(p.sync.hasDeferredChanges()).toBe(true)
    p.sync.applyDeferredOnNavigate()
    expect(answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'collega actief' })
    expect(p.sync.knownVersion.value).toBe(8)
    expect(p.sync.hasDeferredChanges()).toBe(false)
  })

  it('applyDeferredOnNavigate is a no-op without deferred changes', async () => {
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    expect(() => p.sync.applyDeferredOnNavigate()).not.toThrow()
  })
})

describe('saveAppState with deferred changes (handles them first)', () => {
  it('processes deferred changes before saving (merged path)', async () => {
    vi.useFakeTimers()
    const fixtures = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Defer an active-section change
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '1.1': { value: 'collega' } },
      },
    }))
    await p.sync.handleRemoteChange('1')
    expect(p.sync.hasDeferredChanges()).toBe(true)

    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 9 }))
    // saveAppState sees deferredChanges.length > 0 → applyDeferredChanges first → returns
    await p.saveAppState()
    await vi.runAllTimersAsync()
    expect(fixtures.answerStore.answers[FormType.DPIA]['1.1']).toEqual({ value: 'collega' })
  })
})

describe('waitForSaveComplete (via handleRemoteChange during in-flight save)', () => {
  it('waits for an in-flight save to finish before fetching fresh state', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }

    // Make update hang until we release it → saveInProgress stays true
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    mockUpdate.mockImplementationOnce(async () => {
      await gate
      return getResponse({ currentVersion: 2 })
    })

    const savePromise = p.saveAppState() // saveInProgress = true, awaiting update
    await Promise.resolve()

    // handleRemoteChange should await saveComplete (in-flight). GET returns no diff.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 2,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'mijn' } } },
    }))
    const remotePromise = p.sync.handleRemoteChange('1')

    release() // let the save finish
    await savePromise
    const result = await remotePromise
    expect(result).toBeDefined()
  })
})

describe('formatConflictValue (via conflict dialog field formatting)', () => {
  // Drives every branch of formatConflictValue and getFieldLabel through a conflict.
  async function conflictWith(
    myValue: unknown,
    theirValue: unknown,
    fieldId: string,
  ) {
    const { answerStore, taskStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    if (fieldId.startsWith('completed.')) {
      // baseline has it complete, user un-completes (myValue false), server keeps complete
      // We instead drive completed conflicts directly through answers below; handled separately.
    }
    answerStore.answers[FormType.DPIA][fieldId] = myValue as never
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])

    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { [fieldId]: theirValue },
      },
    }))
    await p.saveAppState()
    await nextTick()
    return p
  }

  it('formats wrapped boolean values as Ja/Nee', async () => {
    const p = await conflictWith({ value: true }, { value: false }, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Ja')
    expect(f.theirFormatted).toBe('Nee')
  })

  it('formats wrapped string-boolean values as Ja/Nee', async () => {
    const p = await conflictWith({ value: 'true' }, { value: 'false' }, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Ja')
    expect(f.theirFormatted).toBe('Nee')
  })

  it('formats wrapped empty arrays as "Geen selectie" and non-empty arrays as a list', async () => {
    const p = await conflictWith({ value: [] }, { value: ['<b>A</b>', 'B'] }, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Geen selectie')
    expect(f.theirFormatted).toContain('<li>')
    expect(f.theirFormatted).toContain('A') // html stripped from <b>A</b>
    expect(f.theirFormatted).not.toContain('<b>')
  })

  it('formats wrapped string values with HTML escaped and newlines as <br>', async () => {
    const p = await conflictWith({ value: 'regel1\nregel2' }, { value: 'andere <i>tekst</i>' }, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toContain('<br>')
    expect(f.theirFormatted).toContain('andere')
  })

  it('formats plain string "true"/"false" values', async () => {
    const p = await conflictWith('true', 'false', '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Ja')
    expect(f.theirFormatted).toBe('Nee')
  })

  it('formats a plain non-boolean string with HTML escaped', async () => {
    const p = await conflictWith('plain a', 'plain b', '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('plain a')
    expect(f.theirFormatted).toBe('plain b')
  })

  it('formats an empty plain string as "Leeg"', async () => {
    const p = await conflictWith('', 'iets', '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Leeg')
  })

  it('formats null/undefined values as "Leeg" and primitive booleans', async () => {
    // myValue is a bare boolean (not wrapped, not string) and theirValue is null
    const p = await conflictWith(true, null, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Ja')
    expect(f.theirFormatted).toBe('Leeg')
  })

  it('formats a bare boolean false (non-completed field) as "Nee"', async () => {
    // Bare boolean false on a non-`completed.` field → the `: 'Nee'` ternary branch.
    const p = await conflictWith(false, true, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('Nee')
    expect(f.theirFormatted).toBe('Ja')
  })

  it('formats a non-string, non-boolean, non-object scalar via JSON.stringify', async () => {
    const p = await conflictWith(42, 43, '1.1')
    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    expect(f.myFormatted).toBe('42')
    expect(f.theirFormatted).toBe('43')
  })
})

describe('getFieldLabel — truncation and unknown fields', () => {
  it('truncates a very long task label to 80 chars with ellipsis', async () => {
    // Build a schema whose task 1.1 has a >80 char label.
    setActivePinia(createPinia())
    const longText = 'A'.repeat(120)
    const schemaStore = useSchemaStore()
    const schema = {
      name: 'Test', urn: 'urn:nl:dpia:3.0', version: '3.0', description: 'd',
      tasks: [
        { id: '0', task: 'Inleiding', type: ['task_group'], tasks: [] },
        { id: '1', task: 'Sectie', type: ['task_group'], is_official_id: false, tasks: [
          { id: '1.1', task: longText, type: ['text_input'], is_official_id: true },
        ] },
      ],
    }
    schemaStore.init({ dpia: schema, preScan: schema })
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(schema.tasks as never)
    taskStore.isInitialized[FormType.DPIA] = true
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.DPIA)

    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'collega' } } },
    }))
    await p.saveAppState()
    await nextTick()

    const f = p.conflictState.fields.find(x => x.fieldId === '1.1')!
    // is_official_id task → label is "1.1. " + truncated 80-char text ("...").
    expect(f.label.endsWith('...')).toBe(true)
    expect(f.label).toBe('1.1. ' + 'A'.repeat(77) + '...')
  })

  it('falls back to the fieldId when the task is unknown', async () => {
    const { answerStore, taskStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Unknown field id (no task definition).
    answerStore.answers[FormType.DPIA]['99.9'] = { value: 'mijn', lastEditedAt: 't' }
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['1'])
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '99.9': { value: 'collega' } } },
    }))
    await p.saveAppState()
    await nextTick()

    const f = p.conflictState.fields.find(x => x.fieldId === '99.9')!
    expect(f.label).toBe('99.9')
  })
})

describe('getSectionLabel truncation (via handleRemoteChange background label)', () => {
  it('truncates section labels longer than 60 characters', async () => {
    setActivePinia(createPinia())
    const longSection = 'B'.repeat(100)
    const schema = {
      name: 'Test', urn: 'urn:nl:dpia:3.0', version: '3.0', description: 'd',
      tasks: [
        { id: '0', task: longSection, type: ['task_group'], is_official_id: false, tasks: [
          { id: '0.1', task: 'Veld', type: ['text_input'], is_official_id: true },
        ] },
        { id: '1', task: 'Sectie 1', type: ['task_group'], is_official_id: false, tasks: [
          { id: '1.1', task: 'Veld', type: ['text_input'], is_official_id: true },
        ] },
      ],
    }
    const schemaStore = useSchemaStore()
    schemaStore.init({ dpia: schema, preScan: schema })
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(schema.tasks as never)
    taskStore.isInitialized[FormType.DPIA] = true
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.DPIA)

    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // remote change on background section 0 (long label)
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'achtergrond' } } },
    }))
    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundSectionLabels[0].endsWith('...')).toBe(true)
    expect(result.backgroundSectionLabels[0].length).toBe(60)
  })
})

describe('PRE_SCAN namespace branches', () => {
  function initPreScanOnly() {
    setActivePinia(createPinia())
    const schemaStore = useSchemaStore()
    schemaStore.init({ dpia: buildSchema('urn:nl:dpia:3.0'), preScan: buildSchema('urn:nl:prescan:1.0') })
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    // Note: deliberately do NOT taskStore.init() for PRE_SCAN, leaving flatTasks[PRE_SCAN] = {}.
    taskStore.isInitialized[FormType.PRE_SCAN] = true
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    return { schemaStore, taskStore, answerStore }
  }

  it('saves a PRE_SCAN assessment (ns !== DPIA, empty flatTasks → ungrouped answers)', async () => {
    const { answerStore } = initPreScanOnly()
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 1,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:1.0' }, answers: {} },
    }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.PRE_SCAN)
    await p.loadAppState(FormType.PRE_SCAN)
    p.snapshotBaseline()

    answerStore.answers[FormType.PRE_SCAN]['0.1'] = { value: 'prescan antwoord', lastEditedAt: 't' }
    await p.saveAppState()

    const payload = mockUpdate.mock.calls[0][1]
    // flatTasks empty → answers passed through ungrouped; no _prescanAnswers (ns !== DPIA)
    expect(payload.answers['0.1']).toEqual({ value: 'prescan antwoord', lastEditedAt: 't' })
    expect('_prescanAnswers' in payload).toBe(false)
  })
})

describe('getRootTaskForField returns null when the namespace task map is missing', () => {
  it('routes a remote change to the background bucket with no section label', async () => {
    initStores()
    const taskStore = useTaskStore()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Remove the DPIA task map entirely so flatTasks[ns] is undefined.
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.DPIA]

    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'wijziging' } } },
    }))
    const result = await p.sync.handleRemoteChange('1')
    // getRootTaskForField returns null (no flatTasks) → background bucket, no label collected
    expect(result.backgroundMerged).toBe(1)
    expect(result.backgroundSectionLabels).toEqual([])
  })
})

describe('normalizeServerResponse additional branches', () => {
  it('handles server metadata without an answers key', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' } }, // no answers
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers).toEqual({})
  })

  it('namespaced format with neither taskState nor metadata completedTasks → empty', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { [FormType.DPIA]: { '1.1': { value: 'genest' } } },
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const state = await p.loadAppState(FormType.DPIA)
    expect(state!.answers['1.1']).toEqual({ value: 'genest' })
    expect('completedTasks' in state!.metadata).toBe(false)
  })
})

describe('applyFieldChange — un-complete branch (background remote change)', () => {
  it('removes a completed task when a colleague un-completes a background section', async () => {
    const { taskStore } = initStores()
    // Load with section 0 completed so the baseline includes it.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 1,
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0', completedTasks: ['0'] },
        answers: {},
      },
    }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    const loaded = await p.loadAppState(FormType.DPIA)
    p.applyAppState(loaded!)
    p.snapshotBaseline()
    expect(taskStore.completedRootTaskIds[FormType.DPIA].has('0')).toBe(true)

    // Wipe the active answers map. The only remote change is a section un-complete
    // (the `completed.` branch of applyFieldChange, which does NOT recreate answers[ns]),
    // so buildState later hits `answerStore.answers[ns] || {}` with answers[ns] undefined.
    const answerStore = useAnswerStore()
    delete (answerStore.answers as Record<string, unknown>)[FormType.DPIA]

    // Colleague un-completes section 0 (a background section while active is "1").
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: {} },
    }))
    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(1)
    expect(taskStore.completedRootTaskIds[FormType.DPIA].has('0')).toBe(false)
  })
})

describe('handleConflict — overlapping field with equal values (no conflict)', () => {
  it('does not treat an identically-changed field as a conflict', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // User changes 1.1 to "samen". Server also changed 1.1 to the SAME "samen".
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'samen' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'samen' } } },
    }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 10 }))

    await p.saveAppState()
    // 1.1 is in both pending and serverDiff but values are equal → no conflict → auto-merge.
    expect(p.conflictState.active).toBe(false)
    expect(p.sync.knownVersion.value).toBe(10)
  })
})

describe('handleConflict — resolution with a non-pending fieldId (mine)', () => {
  it('ignores a "mine" choice for a field absent from pendingChanges', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }
    mockUpdate.mockRejectedValueOnce(new MockApiError('Conflict', 409))
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 9,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'collega' } } },
    }))
    await p.saveAppState()
    await nextTick()

    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 12 }))
    // Include a phantom field id with choice 'mine' that is not in pendingChanges.
    p.conflictState.resolve(new Map([['1.1', 'mine'], ['phantom', 'mine']]))
    await nextTick()
    await Promise.resolve()

    expect(p.conflictState.active).toBe(false)
  })
})

describe('applyDeferredChangesInner — resolution with a non-pending fieldId (mine)', () => {
  it('ignores a "mine" choice for a field absent from pendingChanges', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const answerStore = useAnswerStore()

    // Defer a conflicting active-section change on 1.1.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '1.1': { value: 'collega' } } },
    }))
    const remote = await p.sync.handleRemoteChange('1')
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'mijn', lastEditedAt: 't' }

    await p.sync.applyDeferredChanges(remote.changeId)
    await nextTick()
    expect(p.conflictState.active).toBe(true)

    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 20 }))
    p.conflictState.resolve(new Map([['1.1', 'mine'], ['phantom', 'mine']]))
    await nextTick()
    await Promise.resolve()
    expect(p.conflictState.active).toBe(false)
  })
})

describe('debouncedSave — clears an existing timer on re-trigger', () => {
  it('replaces a live debounce timer when triggered twice', async () => {
    vi.useFakeTimers()
    const { answerStore } = initStores()
    mockGet.mockResolvedValue(getResponse({ currentVersion: 1 }))
    mockUpdate.mockResolvedValue(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    // First mutation → schedules a debounce.
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'eerste', lastEditedAt: 't' }
    await nextTick()
    // Second mutation before the first fires → debouncedSave sees a live timer and clears it.
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'tweede', lastEditedAt: 't2' }
    await nextTick()

    await vi.runAllTimersAsync()
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    teardown()
  })
})

describe('buildState / getRootTaskForField with null pinnedNamespace', () => {
  it('uses the active namespace when no namespace was pinned (handleRemoteChange before load)', async () => {
    // Factory with no namespace and no loadAppState/snapshotBaseline → pinnedNamespace stays null.
    initStores()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1') // pinnedNamespace = null

    // lastSavedState is null → computeFieldDiff(null, server) yields all server fields as changes.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 3,
      updatedAt: '2026-04-12T20:00:00.000Z',
      state: {
        metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
        answers: { '0.1': { value: 'achtergrond veld' } },
      },
    }))
    const result = await p.sync.handleRemoteChange('1')
    // pinnedNamespace null → falls back to activeNamespace (DPIA) in buildState,
    // getRootTaskForField and getSectionLabel.
    expect(result.backgroundMerged).toBe(1)
    expect(result.backgroundSectionLabels.length).toBe(1)
  })
})

describe('buildApiState with a missing flatTasks map', () => {
  it('falls back to {} for flatTasks and passes answers through ungrouped', async () => {
    setActivePinia(createPinia())
    const schemaStore = useSchemaStore()
    schemaStore.init({ dpia: buildSchema('urn:nl:dpia:3.0'), preScan: buildSchema('urn:nl:prescan:1.0') })
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.isInitialized[FormType.PRE_SCAN] = true
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.PRE_SCAN)

    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 1,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:prescan:1.0' }, answers: {} },
    }))
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 2 }))

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1', FormType.PRE_SCAN)
    await p.loadAppState(FormType.PRE_SCAN)
    p.snapshotBaseline()

    // Remove the PRE_SCAN flatTasks map so buildApiState hits `flatTasks[ns] || {}`.
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.PRE_SCAN]

    answerStore.answers[FormType.PRE_SCAN]['0.1'] = { value: 'x', lastEditedAt: 't' }
    await p.saveAppState()

    const payload = mockUpdate.mock.calls[0][1]
    expect(payload.answers['0.1']).toEqual({ value: 'x', lastEditedAt: 't' })
  })
})

describe('applyFieldChange — initializes a missing answers namespace', () => {
  it('creates answers[ns] when applying a background field to an empty namespace', async () => {
    const { answerStore } = initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Wipe the active answers map so applyFieldChange has to recreate it.
    delete (answerStore.answers as Record<string, unknown>)[FormType.DPIA]

    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'achtergrond' } } },
    }))
    await p.sync.handleRemoteChange('1')
    expect(answerStore.answers[FormType.DPIA]['0.1']).toEqual({ value: 'achtergrond' })
  })
})

describe('getRootTaskForField — empty taskId yields null', () => {
  it('returns null for an empty-string field id', async () => {
    initStores()
    mockGet.mockResolvedValueOnce(getResponse({ currentVersion: 1 }))
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()

    // Server introduces an answer keyed by the empty string → parseInstanceId('') → taskId '',
    // and `taskId || null` returns null.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 8,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '': { value: 'leeg id' } } },
    }))
    const result = await p.sync.handleRemoteChange('1')
    expect(result.backgroundMerged).toBe(1)
    // root null → not added to backgroundSectionIds → no label
    expect(result.backgroundSectionLabels).toEqual([])
  })
})

describe('buildApiState with null pinnedNamespace (save after an unpinned remote sync)', () => {
  it('uses the active namespace inside buildApiState when nothing was pinned', async () => {
    initStores()
    const answerStore = useAnswerStore()
    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1') // pinnedNamespace = null

    // handleRemoteChange sets knownVersion + lastSavedState WITHOUT pinning the namespace.
    mockGet.mockResolvedValueOnce(getResponse({
      currentVersion: 3,
      state: { metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' }, answers: { '0.1': { value: 'achtergrond' } } },
    }))
    await p.sync.handleRemoteChange('1')
    expect(p.sync.knownVersion.value).toBe(3)

    // Now a direct save runs with knownVersion set but pinnedNamespace still null →
    // buildApiState resolves ns via `pinnedNamespace || taskStore.activeNamespace`.
    mockUpdate.mockResolvedValueOnce(getResponse({ currentVersion: 4 }))
    answerStore.answers[FormType.DPIA]['1.1'] = { value: 'nieuw', lastEditedAt: 't' }
    await p.saveAppState()

    expect(mockUpdate).toHaveBeenCalled()
    expect(p.sync.knownVersion.value).toBe(4)
  })
})

describe('persistPendingToSession — no pending changes (size === 0 early return)', () => {
  it('does not write to sessionStorage when an instances-only save expires with no field changes', async () => {
    vi.useFakeTimers()
    const { taskStore } = initStores()
    mockGet.mockResolvedValue(getResponse({ currentVersion: 1 }))
    // The instances-only save throws SessionExpiredError; persistPendingToSession then
    // recomputes pending changes (none — only instances were dirty) and returns early.
    mockUpdate.mockRejectedValue(new MockSessionExpiredError())

    const { createApiPersistence } = await loadModule()
    const p = createApiPersistence('a1')
    await p.loadAppState(FormType.DPIA)
    p.snapshotBaseline()
    const teardown = p.setupWatchers()

    // Adding a repeatable instance sets instancesDirty (no answer/field change).
    taskStore.addRepeatableTaskInstance('2.1')
    await nextTick()
    await vi.runAllTimersAsync()

    expect(mockUpdate).toHaveBeenCalled()
    // No field changes → persistPendingToSession returns before writing anything.
    expect(sessionStorage.getItem('pending:a1')).toBeNull()
    teardown()
  })
})

// Helper used by a fake-timer test above.
function teardownTimers() {
  vi.runOnlyPendingTimers()
}

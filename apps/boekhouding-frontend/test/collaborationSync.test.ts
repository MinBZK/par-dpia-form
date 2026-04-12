/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore, useAnswerStore, useSchemaStore, FormType } from '@overheid-assessment/core'
import { computeFieldDiff } from '../src/utils/fieldDiff'

// Mock API
const mockGet = vi.fn()
const mockUpdate = vi.fn()

vi.mock('../src/api', () => ({
  assessments: {
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() { super('Sessie verlopen') }
  },
}))

describe('computeFieldDiff', () => {
  it('detects changed answer fields', () => {
    const oldState = {
      metadata: { createdAt: '2026-01-01' },
      answers: { '1.1': { value: 'oud' }, '2.1': { value: 'ongewijzigd' } },
    }
    const newState = {
      metadata: { createdAt: '2026-01-01' },
      answers: { '1.1': { value: 'nieuw' }, '2.1': { value: 'ongewijzigd' } },
    }

    const diff = computeFieldDiff(oldState, newState)

    expect(diff.size).toBe(1)
    expect(diff.has('1.1')).toBe(true)
    expect(diff.get('1.1')!.newValue).toEqual({ value: 'nieuw' })
  })

  it('detects added and removed fields', () => {
    const oldState = {
      metadata: { createdAt: '2026-01-01' },
      answers: { '1.1': { value: 'bestaand' } },
    }
    const newState = {
      metadata: { createdAt: '2026-01-01' },
      answers: { '2.1': { value: 'nieuw veld' } },
    }

    const diff = computeFieldDiff(oldState, newState)

    expect(diff.size).toBe(2)
    expect(diff.has('1.1')).toBe(true) // removed
    expect(diff.get('1.1')!.newValue).toBeNull()
    expect(diff.has('2.1')).toBe(true) // added
    expect(diff.get('2.1')!.newValue).toEqual({ value: 'nieuw veld' })
  })

  it('detects completed task changes', () => {
    const oldState = {
      metadata: { createdAt: '2026-01-01', completedTasks: ['0', '1'] },
      answers: {},
    }
    const newState = {
      metadata: { createdAt: '2026-01-01', completedTasks: ['0', '2'] },
      answers: {},
    }

    const diff = computeFieldDiff(oldState, newState)

    expect(diff.has('completed.1')).toBe(true) // removed
    expect(diff.get('completed.1')!.newValue).toBe(false)
    expect(diff.has('completed.2')).toBe(true) // added
    expect(diff.get('completed.2')!.newValue).toBe(true)
  })

  it('returns empty map when states are identical', () => {
    const state = {
      metadata: { createdAt: '2026-01-01', completedTasks: ['0'] },
      answers: { '1.1': { value: 'test' } },
    }

    const diff = computeFieldDiff(state, JSON.parse(JSON.stringify(state)))
    expect(diff.size).toBe(0)
  })

  it('handles null old state (initial load)', () => {
    const newState = {
      metadata: { createdAt: '2026-01-01' },
      answers: { '1.1': { value: 'eerste antwoord' } },
    }

    const diff = computeFieldDiff(null, newState)

    expect(diff.size).toBe(1)
    expect(diff.has('1.1')).toBe(true)
  })
})

describe('createApiPersistence sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockUpdate.mockReset()

    // Initialize task store with a basic structure
    const taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    const answerStore = useAnswerStore()
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports sync object with required functions', async () => {
    mockGet.mockResolvedValueOnce({
      id: 'a1',
      currentVersion: 1,
      updatedAt: '2026-03-20T12:00:00.000Z',
      state: { metadata: { createdAt: '2026-01-01' }, answers: {} },
    })

    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync, ...persistence } = createApiPersistence('a1')

    expect(sync).toBeDefined()
    expect(sync.knownVersion).toBeDefined()
    expect(sync.knownUpdatedAt).toBeDefined()
    expect(typeof sync.handleRemoteChange).toBe('function')
    expect(typeof sync.applyDeferredChanges).toBe('function')
    expect(typeof sync.applyDeferredOnNavigate).toBe('function')
    expect(typeof sync.hasDeferredChanges).toBe('function')

    // Persistence provider should not leak sync functions
    expect('handleRemoteChange' in persistence).toBe(false)
  })

  it('updates knownVersion and knownUpdatedAt after load', async () => {
    mockGet.mockResolvedValueOnce({
      id: 'a1',
      currentVersion: 5,
      updatedAt: '2026-03-20T14:00:00.000Z',
      state: { metadata: { createdAt: '2026-01-01' }, answers: {} },
    })

    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync, loadAppState } = createApiPersistence('a1')

    await loadAppState(FormType.DPIA)

    expect(sync.knownVersion.value).toBe(5)
    expect(sync.knownUpdatedAt.value).toBe('2026-03-20T14:00:00.000Z')
  })

  it('hasDeferredChanges returns false initially', async () => {
    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync } = createApiPersistence('a1')

    expect(sync.hasDeferredChanges()).toBe(false)
  })

  it('knownVersion starts undefined before load', async () => {
    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync } = createApiPersistence('a1')

    expect(sync.knownVersion.value).toBeUndefined()
    expect(sync.knownUpdatedAt.value).toBeUndefined()
  })

  it('applyDeferredChanges with no deferred changes returns merged', async () => {
    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync } = createApiPersistence('a1')

    const result = await sync.applyDeferredChanges()
    expect(result).toBe('merged')
  })

  it('applyDeferredChanges with stale changeId returns stale', async () => {
    const { createApiPersistence } = await import('../src/ApiPersistence')
    const { sync } = createApiPersistence('a1')

    // No deferred changes, but we pass a specific changeId that doesn't match
    const result = await sync.applyDeferredChanges(999)
    expect(result).toBe('stale')
  })
})

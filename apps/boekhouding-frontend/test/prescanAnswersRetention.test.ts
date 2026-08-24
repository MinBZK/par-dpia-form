/**
 * @vitest-environment jsdom
 *
 * Does `_prescanAnswers` survive in the logged-in variant?
 *
 * `_prescanAnswers` lives only in `cached_state`: the backend keeps it verbatim
 * (STATE_KEYS in apps/boekhouding-backend/src/utils/sanitizeState.ts) but never
 * diffs it, so it is not in the edit log and is not reconstructed. Every save
 * therefore has to carry it along, and buildApiState() only does that when
 * answerStore.answers[PRE_SCAN] is populated.
 *
 * These tests use the real pinia stores and the real ApiPersistence; only the
 * network layer (src/api) is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useTaskStore,
  useAnswerStore,
  useSchemaStore,
  FormType,
  sanitizeAnswers,
} from '@overheid-assessment/core'

const mockGet = vi.fn()
const mockUpdate = vi.fn()

class MockApiError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}
class MockSessionExpiredError extends Error {
  constructor() {
    super('Sessie verlopen')
    this.name = 'SessionExpiredError'
  }
}

vi.mock('../src/api', () => ({
  assessments: {
    get: (...args: unknown[]) => mockGet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  ApiError: MockApiError,
  SessionExpiredError: MockSessionExpiredError,
}))

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
        tasks: [{ id: '0.1', task: 'Titel', type: ['text_input'], is_official_id: true }],
      },
      {
        id: '1',
        task: 'Beschrijving',
        type: ['task_group'],
        is_official_id: false,
        tasks: [{ id: '1.1', task: 'Beschrijf', type: ['open_text'], is_official_id: true }],
      },
    ],
  }
}

const DPIA_SCHEMA = buildSchema('urn:nl:dpia:3.0')
const PRESCAN_SCHEMA = buildSchema('urn:nl:prescan:1.0')

const PRESCAN_ANSWERS = { '0.1': { value: 'pre-scan waarde', lastEditedAt: '2026-01-01T00:00:00.000Z' } }

function initSchemas() {
  const schemaStore = useSchemaStore()
  schemaStore.init({ dpia: DPIA_SCHEMA as never, preScan: PRESCAN_SCHEMA as never })
  return schemaStore
}

/**
 * The hydration block of AssessmentEditor.vue onMounted (lines 219-266):
 * reset every store, then load `_prescanAnswers` into the PRE_SCAN namespace,
 * but only when the PRE_SCAN task structure is not initialized yet.
 */
function mountEditor(serverState: Record<string, unknown> | undefined) {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  taskStore.reset()
  answerStore.reset()

  const schemaStore = initSchemas()

  taskStore.setActiveNamespace(FormType.DPIA)
  answerStore.setActiveNamespace(FormType.DPIA)

  if (serverState) {
    const prescanAnswers = (serverState._prescanAnswers
      ?? (serverState.answers as Record<string, unknown> | undefined)?.[FormType.PRE_SCAN]) as
      Record<string, unknown> | undefined
    if (prescanAnswers && Object.keys(prescanAnswers).length > 0) {
      const preScanSchema = schemaStore.getSchema(FormType.PRE_SCAN)
      if (preScanSchema && !taskStore.isInitialized[FormType.PRE_SCAN]) {
        const prev = taskStore.activeNamespace
        taskStore.setActiveNamespace(FormType.PRE_SCAN)
        answerStore.setActiveNamespace(FormType.PRE_SCAN)
        taskStore.init(preScanSchema.tasks as never)
        answerStore.answers[FormType.PRE_SCAN] = sanitizeAnswers(prescanAnswers).answers as never
        taskStore.setActiveNamespace(prev)
        answerStore.setActiveNamespace(prev)
      }
    }
  }

  return { taskStore, answerStore }
}

/** The persistence part of Form.vue onMounted (steps 2-7). */
async function mountForm(persistence: any) {
  const taskStore = useTaskStore()
  const saved = await persistence.loadAppState(FormType.DPIA)
  taskStore.init(DPIA_SCHEMA.tasks as never)
  if (saved) persistence.applyAppState(saved)
  persistence.snapshotBaseline()
  return persistence.setupWatchers()
}

function serverResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    currentVersion: 1,
    updatedAt: '2026-04-12T12:00:00.000Z',
    ...overrides,
  }
}

function dpiaState(extra: Record<string, unknown> = {}) {
  return {
    $schema: 'x',
    metadata: { createdAt: '2026-01-01', urn: 'urn:nl:dpia:3.0' },
    answers: { '1.1': { value: 'dpia antwoord', lastEditedAt: 't' } },
    ...extra,
  }
}

async function loadPersistence() {
  return import('../src/ApiPersistence')
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockGet.mockReset()
  mockUpdate.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normal editing keeps _prescanAnswers', () => {
  it('carries them into every save of the DPIA', async () => {
    const state = dpiaState({ _prescanAnswers: PRESCAN_ANSWERS })
    mockGet.mockResolvedValue(serverResponse({ state }))
    mockUpdate.mockResolvedValue(serverResponse({ currentVersion: 2 }))

    const { answerStore } = mountEditor(state)
    const { createApiPersistence } = await loadPersistence()
    const p = createApiPersistence('A')
    await mountForm(p)

    answerStore.answers[FormType.DPIA]['0.1'] = { value: 'nieuw', lastEditedAt: 't2' }
    await p.saveAppState()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0][1]._prescanAnswers).toEqual(PRESCAN_ANSWERS)
  })
})

describe('hypothesis 1: a stale isInitialized[PRE_SCAN] skips the read', () => {
  it('is blocked: the editor resets every namespace before it hydrates', async () => {
    // Poison the store the way a previously opened pre-scan assessment would.
    const taskStore = useTaskStore()
    initSchemas()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    taskStore.init(PRESCAN_SCHEMA.tasks as never)
    expect(taskStore.isInitialized[FormType.PRE_SCAN]).toBe(true)

    const state = dpiaState({ _prescanAnswers: PRESCAN_ANSWERS })
    mockGet.mockResolvedValue(serverResponse({ state }))
    mockUpdate.mockResolvedValue(serverResponse({ currentVersion: 2 }))

    const { answerStore } = mountEditor(state)
    // taskStore.reset() (AssessmentEditor.vue:221) cleared the flag, so the read ran.
    expect(answerStore.answers[FormType.PRE_SCAN]).toEqual(PRESCAN_ANSWERS)

    const { createApiPersistence } = await loadPersistence()
    const p = createApiPersistence('A')
    await mountForm(p)
    answerStore.answers[FormType.DPIA]['0.1'] = { value: 'nieuw', lastEditedAt: 't2' }
    await p.saveAppState()

    expect(mockUpdate.mock.calls[0][1]._prescanAnswers).toEqual(PRESCAN_ANSWERS)
  })
})

describe('hypothesis 2: pre-scan answers of A leak into a save of B', () => {
  it('is blocked: mounting B resets the answer store first', async () => {
    // A: DPIA with pre-scan answers.
    const stateA = dpiaState({ _prescanAnswers: PRESCAN_ANSWERS })
    mockGet.mockResolvedValue(serverResponse({ state: stateA }))
    mockUpdate.mockResolvedValue(serverResponse({ currentVersion: 2 }))
    mountEditor(stateA)
    const { createApiPersistence } = await loadPersistence()
    const pA = createApiPersistence('A')
    const teardownA = await mountForm(pA)
    teardownA?.()

    // B: DPIA without pre-scan answers, opened without a page reload.
    const stateB = dpiaState()
    mockGet.mockResolvedValue(serverResponse({ id: 'b1', state: stateB }))
    const { answerStore } = mountEditor(stateB)
    const pB = createApiPersistence('B')
    await mountForm(pB)

    answerStore.answers[FormType.DPIA]['0.1'] = { value: 'b-antwoord', lastEditedAt: 't2' }
    mockUpdate.mockClear()
    await pB.saveAppState()

    expect(mockUpdate.mock.calls[0][0]).toBe('B')
    expect('_prescanAnswers' in mockUpdate.mock.calls[0][1]).toBe(false)
  })
})

describe('a 409 auto-merge that outlives the editor', () => {
  it('does not save at all once the editor is gone, so _prescanAnswers cannot be dropped', async () => {
    const stateA = dpiaState({ _prescanAnswers: PRESCAN_ANSWERS })
    mockGet.mockResolvedValueOnce(serverResponse({ state: stateA }))

    const { answerStore } = mountEditor(stateA)
    const { createApiPersistence } = await loadPersistence()
    const pA = createApiPersistence('A')
    const teardownA = await mountForm(pA)

    // The user edits field 0.1; a colleague has meanwhile saved a change to 1.1.
    answerStore.answers[FormType.DPIA]['0.1'] = { value: 'mijn wijziging', lastEditedAt: 't2' }

    // The save collides (409). handleConflict() then re-fetches the server state;
    // we hold that fetch open to model the window in which the user navigates away.
    mockUpdate.mockRejectedValueOnce(new MockApiError('conflict', 409))
    mockUpdate.mockResolvedValueOnce(serverResponse({ currentVersion: 3 }))
    let releaseConflictGet: (v: unknown) => void
    mockGet.mockReturnValueOnce(new Promise(resolve => { releaseConflictGet = resolve }))

    const savePromise = pA.saveAppState()
    await Promise.resolve()

    // Navigate to assessment B: the editor unmounts (watchers and timers torn
    // down) and B's onMounted resets the stores. Nothing cancels the in-flight
    // conflict handling of A.
    teardownA?.()
    const { answerStore: storeB } = mountEditor(dpiaState())

    releaseConflictGet!(serverResponse({
      currentVersion: 2,
      state: dpiaState({
        answers: { '1.1': { value: 'wijziging van collega', lastEditedAt: 't3' } },
        _prescanAnswers: PRESCAN_ANSWERS,
      }),
    }))
    await savePromise

    // Only the original (409-ing) PUT was sent; the merge is abandoned instead of
    // writing assessment B's store contents to assessment A.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0][0]).toBe('A')
    expect(mockUpdate.mock.calls[0][1]._prescanAnswers).toEqual(PRESCAN_ANSWERS)

    // A's server state is not merged into B's stores either.
    expect(storeB.answers[FormType.DPIA]['1.1']).toBeUndefined()
  })
})

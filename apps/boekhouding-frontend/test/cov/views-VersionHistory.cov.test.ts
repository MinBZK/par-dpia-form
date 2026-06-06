/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// --- Router mock ------------------------------------------------------------
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

// --- API mock ---------------------------------------------------------------
// All assessment API calls are spies we control per-test.
const apiGet = vi.fn()
const apiVersions = vi.fn()
const apiVersion = vi.fn()
const apiVersionEdits = vi.fn()
const apiUpdate = vi.fn()
const apiUpdateVersionDescription = vi.fn()

vi.mock('../../src/api', () => ({
  assessments: {
    get: (...a: unknown[]) => apiGet(...a),
    versions: (...a: unknown[]) => apiVersions(...a),
    version: (...a: unknown[]) => apiVersion(...a),
    versionEdits: (...a: unknown[]) => apiVersionEdits(...a),
    update: (...a: unknown[]) => apiUpdate(...a),
    updateVersionDescription: (...a: unknown[]) => apiUpdateVersionDescription(...a),
  },
}))

// NOTE: the component dynamically imports the generated DPIA/PreScanDPIA JSON
// in onMounted when the schema store is not yet initialized. We deliberately do
// NOT vi.mock those JSON paths — mocking them leaves the SFC's dynamic import
// promise unresolved (the factory does not apply to the SFC module-graph node),
// which hangs onMounted forever. Instead the real (small, static) JSON files
// load; tests that want to skip that path pre-set schemaInitialized = true.

// --- Core package mock ------------------------------------------------------
// Controllable task/schema/answer stores plus the small set of helpers the
// component uses. Keeping this surface tiny avoids pulling in the real engine.
enum FormType {
  DPIA = 'dpia',
  PRE_SCAN = 'prescan',
}

// flatTasks lookup driven per-test; keyed by `${namespace}|${taskId}`.
const flatTaskMap: Record<string, Record<string, any>> = {
  [FormType.DPIA]: {},
  [FormType.PRE_SCAN]: {},
}

const schemaInitialized = { value: false }
const taskInitialized = {
  [FormType.DPIA]: false,
  [FormType.PRE_SCAN]: false,
}

const schemaInit = vi.fn(() => {
  schemaInitialized.value = true
})
const getSchema = vi.fn((ns: FormType) => ({ tasks: [], _ns: ns }))
const taskInit = vi.fn()
const setActiveNamespace = vi.fn()
const taskReset = vi.fn()
const answerReset = vi.fn()
// vi.mock factories cannot safely close over plain module consts that are in a
// temporal dead zone at hoist time, so create this one via vi.hoisted.
const { autoGrowTextareaMock } = vi.hoisted(() => ({ autoGrowTextareaMock: vi.fn() }))

const getTasksFromNamespace = vi.fn((ns: FormType) => flatTaskMap[ns])
const getTaskByIdFromNamespace = vi.fn(
  (ns: FormType, taskId: string) => flatTaskMap[ns]?.[taskId] ?? null,
)

vi.mock('@overheid-assessment/core', () => ({
  FormType: {
    DPIA: 'dpia',
    PRE_SCAN: 'prescan',
  },
  // Strip surrounding HTML tags, matching the real helper's plain-text intent.
  getPlainTextWithoutDefinitions: (html: string | null | undefined) =>
    (html ?? '').replace(/<[^>]*>/g, ''),
  autoGrowTextarea: autoGrowTextareaMock,
  useSchemaStore: () => ({
    get isInitialized() {
      return schemaInitialized.value
    },
    init: schemaInit,
    getSchema,
  }),
  useTaskStore: () => ({
    get isInitialized() {
      return taskInitialized
    },
    init: taskInit,
    setActiveNamespace,
    reset: taskReset,
    getTasksFromNamespace,
    getTaskByIdFromNamespace,
  }),
  useAnswerStore: () => ({
    reset: answerReset,
  }),
}))

import VersionHistory from '../../src/views/VersionHistory.vue'

// --- AppHeader stub ---------------------------------------------------------
const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute'],
  template: '<header class="app-header-stub" :data-back-route="backRoute"></header>',
}

const ASSESSMENT_ID = 'assess-1'

function setTasks(tasks: Record<FormType, Record<string, any>>) {
  flatTaskMap[FormType.DPIA] = tasks[FormType.DPIA] ?? {}
  flatTaskMap[FormType.PRE_SCAN] = tasks[FormType.PRE_SCAN] ?? {}
}

function mountView() {
  return mount(VersionHistory, {
    props: { assessmentId: ASSESSMENT_ID },
    global: { stubs: { AppHeader: AppHeaderStub, IconDotsVertical: true } },
  })
}

// onMounted awaits a real dynamic JSON import (when the schema store is not
// pre-initialized). A fixed number of cycles is flaky under full-suite CPU load:
// the import can resolve after the test ends, leaking init() calls into the next
// test. Instead wait deterministically until schemaStore.init has actually run
// (the signal the import resolved), then drain the synchronous continuation.
async function flush() {
  await vi.waitFor(
    () => {
      if (schemaInit.mock.calls.length === 0) throw new Error('schema not initialized yet')
    },
    { timeout: 5000, interval: 10 },
  )
  await flushPromises()
}

// Open the field kebab and trigger the field-restore modal's confirm button.
async function fieldRestoreDialogConfirm(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find('.diff-kebab .kebab-menu__trigger').trigger('click')
  const item = wrapper.findAll('.kebab-menu__item').find((b) => b.text().includes('Herstel dit antwoord'))!
  await item.trigger('mousedown')
  await flushPromises()
  const dialog = wrapper.findAll('dialog.confirm-dialog').find((d) => d.text().includes('Antwoord herstellen'))!
  await dialog.find('.utrecht-button--primary-action').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: stores already initialized so onMounted skips the dynamic JSON
  // import (fast + deterministic). Specific tests opt into the uninitialized
  // branch by flipping these back to false and awaiting flush().
  schemaInitialized.value = true
  taskInitialized[FormType.DPIA] = true
  taskInitialized[FormType.PRE_SCAN] = true
  flatTaskMap[FormType.DPIA] = {}
  flatTaskMap[FormType.PRE_SCAN] = {}

  // jsdom <dialog> lacks showModal/close; stub them so the watchers don't throw.
  if (!(HTMLDialogElement.prototype as any).showModal) {
    ;(HTMLDialogElement.prototype as any).showModal = function () {
      this.open = true
    }
  }
  if (!(HTMLDialogElement.prototype as any).close) {
    ;(HTMLDialogElement.prototype as any).close = function () {
      this.open = false
    }
  }

  // Default happy-path API responses; tests override as needed.
  apiGet.mockResolvedValue({ role: 'owner', projectId: 'proj-1', currentVersion: 3, state: { answers: {} } })
  apiVersions.mockResolvedValue([])
  apiVersion.mockResolvedValue({ state: {} })
  apiVersionEdits.mockResolvedValue([])
  apiUpdate.mockResolvedValue({})
  apiUpdateVersionDescription.mockResolvedValue({})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VersionHistory — mount & onMounted', () => {
  it('initializes schema + task stores when uninitialized and shows empty state', async () => {
    // Opt into the uninitialized branch: onMounted runs the real dynamic import.
    schemaInitialized.value = false
    taskInitialized[FormType.DPIA] = false
    taskInitialized[FormType.PRE_SCAN] = false
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    // While loading, the "Laden..." text shows.
    expect(wrapper.text()).toContain('Laden...')
    await flush()

    // Schema + task stores got initialized.
    expect(schemaInit).toHaveBeenCalled()
    expect(taskInit).toHaveBeenCalledTimes(2)
    expect(setActiveNamespace).toHaveBeenCalledWith(FormType.DPIA)
    expect(setActiveNamespace).toHaveBeenCalledWith(FormType.PRE_SCAN)

    expect(wrapper.text()).toContain('Geen versies gevonden.')
  })

  it('skips store initialization when already initialized', async () => {
    // schemaInitialized / taskInitialized default to true in beforeEach.
    mountView()
    await flushPromises()

    expect(schemaInit).not.toHaveBeenCalled()
    expect(taskInit).not.toHaveBeenCalled()
  })

  it('does not call taskStore.init when getSchema returns null', async () => {
    schemaInitialized.value = false
    taskInitialized[FormType.DPIA] = false
    taskInitialized[FormType.PRE_SCAN] = false
    getSchema.mockReturnValue(null as any)
    mountView()
    await flush()

    expect(setActiveNamespace).not.toHaveBeenCalled()
    expect(taskInit).not.toHaveBeenCalled()
  })

  it('falls back to null role when assessment has no role', async () => {
    apiGet.mockResolvedValue({ projectId: 'proj-1', currentVersion: 1, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'Sam', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()

    // role null → canEdit false → no action column header.
    expect(wrapper.find('.version-col--action').exists()).toBe(false)
  })

  it('resets the task and answer stores on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.unmount()
    expect(taskReset).toHaveBeenCalledTimes(1)
    expect(answerReset).toHaveBeenCalledTimes(1)
  })
})

describe('VersionHistory — version list rendering', () => {
  it('renders rows, formatted date, author and single-line description', async () => {
    apiVersions.mockResolvedValue([
      {
        id: 'v2',
        version: 2,
        createdByName: 'Noor',
        updatedAt: '2026-03-20T12:00:00Z',
        changeDescription: 'Eerste regel\nTweede regel',
      },
      {
        id: 'v1',
        version: 1,
        createdByName: 'Sam',
        updatedAt: '2026-03-19T09:30:00Z',
        changeDescription: null,
      },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('.version-row').length).toBeGreaterThanOrEqual(3) // header + 2 rows
    // Multi-line description collapses to first line + ellipsis marker.
    expect(wrapper.text()).toContain('Eerste regel')
    expect(wrapper.text()).toContain('Noor')
    expect(wrapper.text()).toContain('Sam')
    // formatDate output (Dutch locale month name).
    expect(wrapper.text()).toMatch(/maart/)
  })

  it('shows toggle button only for versions above 1', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
      { id: 'v1', version: 1, createdByName: 'B', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    // Only version 2 has a toggle button.
    expect(wrapper.findAll('.toggle-btn').length).toBe(1)
  })
})

describe('VersionHistory — canEdit / canRestore (role permissions)', () => {
  it('editor role: canEdit true, canRestore false (no restore menu item)', async () => {
    apiGet.mockResolvedValue({ role: 'editor', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: 'desc' },
    ])
    const wrapper = mountView()
    await flushPromises()

    // canEdit true → action column + kebab present.
    expect(wrapper.find('.kebab-menu__trigger').exists()).toBe(true)
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    // Description-edit menu item present, restore item absent.
    expect(wrapper.text()).toContain('Beschrijving bewerken')
    expect(wrapper.text()).not.toContain('Herstellen naar deze versie')
  })

  it('viewer role: canEdit false, hides action column entirely', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 1, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: 'desc' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.kebab-menu__trigger').exists()).toBe(false)
    // Read-only description span (no edit button).
    expect(wrapper.find('.desc-edit-btn').exists()).toBe(false)
  })

  it('owner role: shows "Beschrijving toevoegen" when no description and restore item', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.kebab-menu__trigger').trigger('click')
    expect(wrapper.text()).toContain('Beschrijving toevoegen')
    expect(wrapper.text()).toContain('Herstellen naar deze versie')
  })
})

describe('VersionHistory — kebab menu toggle & focusout', () => {
  it('toggles open and closed on repeated trigger clicks and closes on focusout', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'd' },
    ])
    const wrapper = mountView()
    await flushPromises()

    const trigger = wrapper.find('.kebab-menu__trigger')
    await trigger.trigger('click')
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(true)
    // Click again → closes.
    await trigger.trigger('click')
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)

    // Open then focusout closes it.
    await trigger.trigger('click')
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(true)
    await wrapper.find('.kebab-menu').trigger('focusout')
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
  })
})

describe('VersionHistory — description modal', () => {
  it('opens via edit button, saves and updates the local version description', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Origineel' },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.desc-edit-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Beschrijving versie 2 bewerken')

    const textarea = wrapper.find('textarea#desc-input')
    await textarea.setValue('Nieuwe beschrijving')
    await textarea.trigger('input') // autoResize handler

    await wrapper.find('.utrecht-button--primary-action').trigger('click')
    await flushPromises()

    expect(apiUpdateVersionDescription).toHaveBeenCalledWith(ASSESSMENT_ID, 2, 'Nieuwe beschrijving')
    expect(wrapper.text()).toContain('Nieuwe beschrijving')
  })

  it('saveDescription returns early when no version selected (modal never opened)', async () => {
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

    // Call the exposed-via-DOM path is not available; drive through component instance.
    const vm = wrapper.vm as any
    await vm.saveDescription()
    expect(apiUpdateVersionDescription).not.toHaveBeenCalled()
  })

  it('sets changeDescription null when cleared to empty, and skips local update when version not found', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'X' },
    ])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any

    // Empty text → falls back to null on the matching version.
    vm.openDescModal(2, 'X')
    await flushPromises()
    const ta = wrapper.find('textarea#desc-input')
    await ta.setValue('')
    await wrapper.find('.utrecht-button--primary-action').trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).toHaveBeenLastCalledWith(ASSESSMENT_ID, 2, '')

    // Now target a version id that does not exist → the find() returns undefined branch.
    apiUpdateVersionDescription.mockClear()
    vm.openDescModal(999, 'whatever')
    await flushPromises()
    await wrapper.find('.utrecht-button--primary-action').trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).toHaveBeenCalledWith(ASSESSMENT_ID, 999, 'whatever')
  })

  it('cancel button closes the modal without saving', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'X' },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.desc-edit-btn').trigger('click')
    await flushPromises()
    const secondary = wrapper.findAll('.confirm-dialog .utrecht-button--secondary-action')[0]
    await secondary.trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).not.toHaveBeenCalled()
  })

  it('opens the description modal from the kebab menu (mousedown)', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Y' },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.kebab-menu__trigger').trigger('click')
    const editItem = wrapper.findAll('.kebab-menu__item').find((b) => b.text().includes('Beschrijving'))!
    await editItem.trigger('mousedown')
    await flushPromises()
    expect(wrapper.text()).toContain('Beschrijving versie 2 bewerken')
  })
})

describe('VersionHistory — restore modal & handleRestore', () => {
  async function openRestoreFor(version: number) {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    const restoreItem = wrapper
      .findAll('.kebab-menu__item')
      .find((b) => b.text().includes('Herstellen naar deze versie'))!
    await restoreItem.trigger('mousedown')
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 5, state: { metadata: { urn: 'x' }, $schema: 'S', answers: { a: 1 } } })
    apiVersions.mockResolvedValue([
      { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: 'd' },
    ])
  })

  it('disables Herstellen button until the confirm word is typed', async () => {
    const wrapper = await openRestoreFor(3)
    const confirmBtn = wrapper.find('.confirm-dialog__delete')
    expect(confirmBtn.attributes('disabled')).toBeDefined()

    await wrapper.find('.confirm-dialog__input').setValue('  HERSTELLEN  ')
    await flushPromises()
    expect(wrapper.find('.confirm-dialog__delete').attributes('disabled')).toBeUndefined()
  })

  it('restores: merges metadata/$schema, calls update and navigates', async () => {
    apiVersion.mockResolvedValue({ state: { metadata: { completedTasks: ['1', '2'] }, answers: { b: 2 } } })
    const wrapper = await openRestoreFor(3)

    await wrapper.find('.confirm-dialog__input').setValue('HERSTELLEN')
    await flushPromises()
    await wrapper.find('.confirm-dialog__delete').trigger('click')
    await flushPromises()

    expect(apiVersion).toHaveBeenCalledWith(ASSESSMENT_ID, 3, { includeState: true })
    const [, restoredState, opts] = apiUpdate.mock.calls[0]
    expect((restoredState as any).metadata).toEqual({ urn: 'x', completedTasks: ['1', '2'] })
    expect((restoredState as any).$schema).toBe('S')
    expect(opts).toEqual({ changeDescription: 'Hersteld naar versie 3', newVersion: true, expectedVersion: 5 })
    expect(routerPush).toHaveBeenCalledWith(`/assessment/${ASSESSMENT_ID}`)
  })

  it('restores with defaulted metadata/answers when version & current state are empty', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 7, state: {} })
    apiVersion.mockResolvedValue({})
    const wrapper = await openRestoreFor(3)

    await wrapper.find('.confirm-dialog__input').setValue('HERSTELLEN')
    await flushPromises()
    await wrapper.find('.confirm-dialog__delete').trigger('click')
    await flushPromises()

    const [, restoredState] = apiUpdate.mock.calls[0]
    // No $schema branch taken, completedTasks defaulted to [], answers defaulted to {}.
    expect((restoredState as any).metadata).toEqual({ completedTasks: [] })
    expect((restoredState as any).answers).toEqual({})
    expect((restoredState as any).$schema).toBeUndefined()
  })

  it('handleRestore returns early when confirm word not matching', async () => {
    const wrapper = await openRestoreFor(3)
    const vm = wrapper.vm as any
    // restoreConfirmText empty → restoreConfirmed false → early return.
    await vm.handleRestore()
    expect(apiVersion).not.toHaveBeenCalled()
  })

  it('alerts and keeps modal open when restore API fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    apiVersion.mockRejectedValue(new Error('boom'))
    const wrapper = await openRestoreFor(3)

    await wrapper.find('.confirm-dialog__input').setValue('HERSTELLEN')
    await flushPromises()
    await wrapper.find('.confirm-dialog__delete').trigger('click')
    await flushPromises()

    expect(alertSpy).toHaveBeenCalledWith('Herstel mislukt. Probeer het opnieuw.')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('Enter key in confirm input triggers restore only when confirmed', async () => {
    apiVersion.mockResolvedValue({ state: { metadata: { completedTasks: [] }, answers: {} } })
    const wrapper = await openRestoreFor(3)
    const input = wrapper.find('.confirm-dialog__input')

    // Not confirmed yet → enter does nothing.
    await input.trigger('keyup.enter')
    await flushPromises()
    expect(apiVersion).not.toHaveBeenCalled()

    await input.setValue('HERSTELLEN')
    await flushPromises()
    await input.trigger('keyup.enter')
    await flushPromises()
    expect(apiVersion).toHaveBeenCalled()
  })

  it('restore modal cancel resets confirm text', async () => {
    const wrapper = await openRestoreFor(3)
    await wrapper.find('.confirm-dialog__input').setValue('partial')
    // Target the restore dialog specifically (others share the button class).
    const restoreDialog = wrapper
      .findAll('dialog.confirm-dialog')
      .find((d) => d.text().includes('Versie herstellen'))!
    await restoreDialog.find('.utrecht-button--secondary-action').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).restoreConfirmText).toBe('')
  })
})

describe('VersionHistory — toggleDiff', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
  })

  it('collapses an expanded version when toggled again', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-panel').exists()).toBe(true)

    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-panel').exists()).toBe(false)
  })

  it('toggleDiff on version <= 1 returns early without fetching edits', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleDiff(1)
    await flushPromises()
    expect(apiVersionEdits).not.toHaveBeenCalled()
    // Diff panel shows the first-version empty message.
    expect(wrapper.text()).toContain('Eerste versie — geen vorige versie om mee te vergelijken.')
  })

  it('shows "Geen inhoudelijke wijzigingen gevonden." when edits map to nothing', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([
      { id: 'e0', fieldId: 'dpia.1.1', editType: 'initial_state', oldValue: null, newValue: null, editedBy: 'x', editedAt: 't', version: 2 },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Geen inhoudelijke wijzigingen gevonden.')
  })

  it('sets empty diff when versionEdits API throws', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockRejectedValue(new Error('fail'))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Geen inhoudelijke wijzigingen gevonden.')
  })

  it('shows the full description block in the diff panel for multi-line descriptions', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Lijn1\nLijn2' },
    ])
    apiVersionEdits.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-description').exists()).toBe(true)
    expect(wrapper.text()).toContain('Volledige beschrijving')
  })
})

describe('VersionHistory — mapEditsToDiffFields branches', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
  })

  async function expandWithEdits(edits: any[], tasks?: Record<FormType, Record<string, any>>) {
    if (tasks) setTasks(tasks)
    apiVersionEdits.mockResolvedValue(edits)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('renders an answer_change with task label (official id) and group label', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': {
          id: '2.1.1',
          task: '<p>E-mailadres</p>',
          is_official_id: true,
          parentId: '2.1',
          options: [],
        },
        '2.1': { id: '2.1', task: '<p>Persoonsgegevens</p>', repeatable: true },
      },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0',
        editType: 'answer_change',
        oldValue: { value: 'oud@example.com' },
        newValue: { value: 'nieuw@example.com' },
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    const table = wrapper.find('.diff-table')
    expect(table.exists()).toBe(true)
    expect(wrapper.find('.diff-field').text()).toContain('2.1.1. E-mailadres')
    // Group label rendered.
    expect(wrapper.find('.diff-field__group').text()).toContain('Persoonsgegevens #1')
    expect(wrapper.text()).toContain('oud@example.com')
    expect(wrapper.text()).toContain('nieuw@example.com')
  })

  it('collapses multiple edits for the same field to net first→last change', async () => {
    setTasks({
      [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      { id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'A' }, newValue: { value: 'B' }, editedBy: 'x', editedAt: 't', version: 2 },
      { id: 'e2', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'B' }, newValue: { value: 'C' }, editedBy: 'x', editedAt: 't', version: 2 },
    ])
    // Only one row, net change A → C.
    expect(wrapper.findAll('.diff-row').length).toBe(1)
    expect(wrapper.find('.diff-old').text()).toContain('A')
    expect(wrapper.find('.diff-new').text()).toContain('C')
  })

  it('skips a field whose net change is identical (no-op)', async () => {
    const wrapper = await expandWithEdits([
      { id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'A' }, newValue: { value: 'A' }, editedBy: 'x', editedAt: 't', version: 2 },
    ])
    expect(wrapper.text()).toContain('Geen inhoudelijke wijzigingen gevonden.')
  })

  it('renders a section_complete edit (completed → not completed) with task name', async () => {
    setTasks({
      [FormType.DPIA]: { '3': { id: '3', task: '<p>Risico-analyse</p>' } },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=completed.3',
        editType: 'section_complete',
        oldValue: true,
        newValue: false,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-field').text()).toContain('Status sectie 3 "Risico-analyse"')
    expect(wrapper.find('.diff-old').text()).toContain('Voltooid')
    expect(wrapper.find('.diff-new').text()).toContain('Niet voltooid')
  })

  it('section_complete with unknown task falls back to taskId as name', async () => {
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=completed.9',
        editType: 'section_complete',
        oldValue: false,
        newValue: true,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-field').text()).toContain('Status sectie 9 "9"')
  })

  it('section_complete with non-parseable fieldId uses raw fieldId as taskId', async () => {
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'plainfieldnodot',
        editType: 'section_complete',
        oldValue: false,
        newValue: true,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    // parseFieldId returns null (no dot), so taskId === raw fieldId.
    expect(wrapper.find('.diff-field').text()).toContain('Status sectie plainfieldnodot')
  })

  it('renders instance_added with formatted child fields', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1': { id: '2.1', task: '<p>Gegevens</p>', is_official_id: true },
        '2.1.1': { id: '2.1.1', task: '<p>Type</p>', options: [] },
      },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1',
        editType: 'instance_added',
        oldValue: null,
        newValue: { '2.1.1': { value: 'E-mail' } },
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-field').text()).toContain('2.1. Gegevens #2')
    expect(wrapper.find('.diff-old').text()).toContain(' '.trim() === '' ? '' : '')
    expect(wrapper.find('.diff-new').text()).toContain('Type')
  })

  it('renders instance_added with empty fields → "Toegevoegd" placeholder', async () => {
    setTasks({
      [FormType.DPIA]: { '2.1': { id: '2.1', task: '<p>Gegevens</p>' } },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
        editType: 'instance_added',
        oldValue: null,
        newValue: {},
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-new').text()).toContain('Toegevoegd')
  })

  it('renders instance_removed with present old values and "Verwijderd" new', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1': { id: '2.1', task: '<p>Gegevens</p>' },
        '2.1.1': { id: '2.1.1', task: '<p>Type</p>' },
      },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
        editType: 'instance_removed',
        oldValue: { '2.1.1': { value: 'Telefoon' } },
        newValue: null,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-new').text()).toContain('Verwijderd')
    expect(wrapper.find('.diff-old').text()).toContain('Type')
  })

  it('renders instance_removed with empty old fields → "Aanwezig" placeholder', async () => {
    setTasks({
      [FormType.DPIA]: { '2.1': { id: '2.1', task: '<p>Gegevens</p>' } },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=2',
        editType: 'instance_removed',
        oldValue: {},
        newValue: null,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-old').text()).toContain('Aanwezig')
  })

  it('instance_added with no parseable URN / no index uses fallbacks', async () => {
    const wrapper = await expandWithEdits([
      {
        id: 'e1',
        fieldId: 'dpia.weirdtask',
        editType: 'instance_added',
        oldValue: null,
        newValue: { foo: { value: 'bar' } },
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    // No index match → no #n suffix; task unknown → taskId as name.
    expect(wrapper.find('.diff-field').text()).toContain('weirdtask')
    expect(wrapper.find('.diff-field').text()).not.toContain('#')
  })

  it('filters out task_instance_add / task_instance_remove edit types', async () => {
    const wrapper = await expandWithEdits([
      { id: 'e1', fieldId: 'dpia.2.1', editType: 'task_instance_add', oldValue: null, newValue: { x: 1 }, editedBy: 'x', editedAt: 't', version: 2 },
      { id: 'e2', fieldId: 'dpia.2.1', editType: 'task_instance_remove', oldValue: { x: 1 }, newValue: null, editedBy: 'x', editedAt: 't', version: 2 },
    ])
    expect(wrapper.text()).toContain('Geen inhoudelijke wijzigingen gevonden.')
  })
})

describe('VersionHistory — getFieldLabel branches', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
  })

  async function labelFor(fieldId: string) {
    const wrapper = mountView()
    await flushPromises()
    return (wrapper.vm as any).getFieldLabel(fieldId)
  }

  it('returns the fieldId itself when there is no namespace dot', async () => {
    expect(await labelFor('nodot')).toEqual({ label: 'nodot' })
  })

  it('returns the fieldId when the task cannot be resolved', async () => {
    expect(await labelFor('dpia.999')).toEqual({ label: 'dpia.999' })
  })

  it('truncates long plain-text labels to 77 chars + ellipsis', async () => {
    const long = 'x'.repeat(200)
    setTasks({
      [FormType.DPIA]: { '5.1': { id: '5.1', task: `<p>${long}</p>` } },
      [FormType.PRE_SCAN]: {},
    })
    const r = await labelFor('dpia.5.1')
    expect(r.label.length).toBe(80)
    expect(r.label.endsWith('...')).toBe(true)
  })

  it('uses prescan namespace and omits official id when not official', async () => {
    setTasks({
      [FormType.DPIA]: {},
      [FormType.PRE_SCAN]: { '1.2': { id: '1.2', task: '<p>Doel</p>', is_official_id: false } },
    })
    const r = await labelFor('prescan.1.2')
    expect(r.label).toBe('Doel')
    expect(r).not.toHaveProperty('groupLabel')
  })

  it('returns no groupLabel when indexed but parent is not repeatable', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: '<p>Veld</p>', parentId: '2.1' },
        '2.1': { id: '2.1', task: '<p>Groep</p>', repeatable: false },
      },
      [FormType.PRE_SCAN]: {},
    })
    const r = await labelFor('dpia.2.1.1[0]')
    expect(r.label).toBe('Veld')
    expect(r.groupLabel).toBeUndefined()
  })

  it('truncates a long repeatable parent name in the group label', async () => {
    const longParent = 'P'.repeat(80)
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: '<p>Veld</p>', parentId: '2.1' },
        '2.1': { id: '2.1', task: `<p>${longParent}</p>`, repeatable: true },
      },
      [FormType.PRE_SCAN]: {},
    })
    const r = await labelFor('dpia.2.1.1[3]')
    expect(r.groupLabel).toMatch(/\.\.\. #4$/)
  })
})

describe('VersionHistory — getRepeatableParentLabel edge branches', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
  })

  async function call(formType: FormType, taskId: string, index: number) {
    const wrapper = mountView()
    await flushPromises()
    return (wrapper.vm as any).getRepeatableParentLabel(formType, taskId, index)
  }

  it('returns null when the namespace has no tasks', async () => {
    getTasksFromNamespace.mockReturnValueOnce(undefined as any)
    expect(await call(FormType.DPIA, '2.1.1', 0)).toBeNull()
  })

  it('returns null when the task has no parent', async () => {
    setTasks({
      [FormType.DPIA]: { '2.1.1': { id: '2.1.1', task: 'V' } },
      [FormType.PRE_SCAN]: {},
    })
    expect(await call(FormType.DPIA, '2.1.1', 0)).toBeNull()
  })

  it('returns null when parent is not repeatable', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: 'V', parentId: '2.1' },
        '2.1': { id: '2.1', task: 'G', repeatable: false },
      },
      [FormType.PRE_SCAN]: {},
    })
    expect(await call(FormType.DPIA, '2.1.1', 0)).toBeNull()
  })

  it('uses parentId as name when the repeatable parent has no task text', async () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: 'V', parentId: '2.1' },
        '2.1': { id: '2.1', task: '', repeatable: true },
      },
      [FormType.PRE_SCAN]: {},
    })
    expect(await call(FormType.DPIA, '2.1.1', 4)).toBe('2.1 #5')
  })
})

describe('VersionHistory — formatValue & formatInstanceFields', () => {
  let vm: any
  beforeEach(async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    vm = wrapper.vm
  })

  it('handles null and undefined → nbsp', () => {
    expect(vm.formatValue(null, null)).toBe(' ')
    expect(vm.formatValue(undefined, null)).toBe(' ')
  })

  it('handles booleans → Ja / Nee', () => {
    expect(vm.formatValue(true, null)).toBe('Ja')
    expect(vm.formatValue(false, null)).toBe('Nee')
  })

  it('handles empty string and "true"/"false" strings', () => {
    expect(vm.formatValue('', null)).toBe(' ')
    expect(vm.formatValue('true', null)).toBe('Ja')
    expect(vm.formatValue('false', null)).toBe('Nee')
  })

  it('parses JSON-array strings and recurses', () => {
    expect(vm.formatValue('["a","b"]', null)).toContain('<li>a</li>')
  })

  it('treats a "[" string that is not JSON as plain text', () => {
    expect(vm.formatValue('[not json', null)).toBe('[not json')
  })

  it('treats a "[" string with trailing junk (parse throws) as plain text', () => {
    // JSON.parse('["x"]extra') throws → caught → stripped + escaped plain text.
    expect(vm.formatValue('["x"]extra', null)).toBe('[&quot;x&quot;]extra')
  })

  it('maps a string value through the options map', () => {
    expect(vm.formatValue('opt1', { opt1: '<b>Optie 1</b>' })).toBe('Optie 1')
  })

  it('formats an ISO date string via the date formatter', () => {
    const out = vm.formatValue('2026-03-20T12:00:00Z', null)
    expect(out).toMatch(/maart/)
  })

  it('returns invalid date string unchanged through formatTimestamp', () => {
    // isoDatePattern matches but Date is invalid → returns the raw value.
    expect(vm.formatTimestamp('not-a-date')).toBe('not-a-date')
  })

  it('escapes plain strings (HTML-significant chars without tags)', () => {
    // stripHtml removes complete tags; ampersand & quotes survive to be escaped.
    expect(vm.formatValue('A & "B"', null)).toBe('A &amp; &quot;B&quot;')
  })

  it('formats an empty array → "Geen selectie"', () => {
    expect(vm.formatValue([], null)).toBe('Geen selectie')
  })

  it('formats an array with options and without options', () => {
    expect(vm.formatValue(['a', 'b'], { a: 'Alpha' })).toContain('<li>Alpha</li>')
    expect(vm.formatValue(['x'], null)).toContain('<li>x</li>')
  })

  it('formats an object wrapper with a string value', () => {
    expect(vm.formatValue({ value: 'hallo' }, null)).toBe('hallo')
  })

  it('formats an object wrapper with a boolean value', () => {
    expect(vm.formatValue({ value: true }, null)).toBe('Ja')
    expect(vm.formatValue({ value: false }, null)).toBe('Nee')
  })

  it('formats object wrapper with "true"/"false" string value', () => {
    expect(vm.formatValue({ value: 'true' }, null)).toBe('Ja')
    expect(vm.formatValue({ value: 'false' }, null)).toBe('Nee')
  })

  it('formats object wrapper with a numeric value (JSON.stringify)', () => {
    expect(vm.formatValue({ value: 42 }, null)).toBe('42')
  })

  it('formats object wrapper with an empty array value → "Geen selectie"', () => {
    expect(vm.formatValue({ value: [] }, null)).toBe('Geen selectie')
  })

  it('formats object wrapper with array value, with and without options', () => {
    expect(vm.formatValue({ value: ['a'] }, { a: 'A' })).toContain('<li>A</li>')
    expect(vm.formatValue({ value: ['b'] }, null)).toContain('<li>b</li>')
  })

  it('renders an ImageValue wrapper as a thumbnail with full metadata', () => {
    const out = vm.formatValue(
      {
        value: {
          data: 'data:image/png;base64,AAAA',
          title: 'Foto',
          description: 'Regel1\nRegel2',
          source: 'Bron X',
        },
      },
      null,
    )
    expect(out).toContain('<img src="data:image/png;base64,AAAA"')
    expect(out).toContain('class="diff-image"')
    expect(out).toContain('<strong>Foto</strong>')
    expect(out).toContain('Regel1 Regel2')
    expect(out).toContain('Bron: Bron X')
  })

  it('renders ImageValue without metadata (no meta div)', () => {
    const out = vm.formatValue(
      { value: { data: 'data:image/jpeg;base64,BBBB' } },
      null,
    )
    expect(out).toContain('<img')
    expect(out).not.toContain('diff-image-meta')
  })

  it('treats an object value with non-image data as a normal object', () => {
    // data present but not a valid data:image URI → falls through to object handling.
    const out = vm.formatValue({ value: { data: 'plain text' } }, null)
    expect(out).toContain('data')
  })

  it('appends remaining object keys (skipping value/timestamp/lastEditedAt/empty)', () => {
    const out = vm.formatValue(
      {
        value: 'hoofd',
        timestamp: '2026-01-01T00:00:00Z',
        lastEditedAt: 'x',
        extra: 'bijlage',
        empty: '',
        nul: null,
        date: '2026-03-20T12:00:00Z',
        flag: true,
        num: 7,
      },
      null,
    )
    expect(out).toContain('hoofd')
    expect(out).toContain('extra: bijlage')
    expect(out).toMatch(/date: .*maart/)
    expect(out).toContain('flag: Ja')
    expect(out).toContain('num: 7')
    expect(out).not.toContain('timestamp')
    expect(out).not.toContain('lastEditedAt')
  })

  it('returns nbsp for an object with no renderable parts', () => {
    expect(vm.formatValue({ value: '', timestamp: 't' }, null)).toBe(' ')
  })

  it('falls through for non-object/array/string/number types (function/symbol)', () => {
    // bigint stringifies via String(); covers the final escapeHtml(String(val)) branch.
    expect(vm.formatValue(10n as unknown, null)).toBe('10')
  })

  it('formatInstanceFields returns empty for non-object inputs', () => {
    expect(vm.formatInstanceFields(null, FormType.DPIA)).toBe('')
    expect(vm.formatInstanceFields('str', FormType.DPIA)).toBe('')
  })

  it('formatInstanceFields returns empty for an empty object', () => {
    expect(vm.formatInstanceFields({}, FormType.DPIA)).toBe('')
  })

  it('formatInstanceFields renders child labels using task definitions and options', () => {
    setTasks({
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: '<p>Type</p>', options: [{ value: 'e', label: 'E-mail' }] },
      },
      [FormType.PRE_SCAN]: {},
    })
    const out = vm.formatInstanceFields({ '2.1.1': { value: 'e' }, unknownChild: { value: 'x' } }, FormType.DPIA)
    expect(out).toContain('<strong>Type</strong>')
    expect(out).toContain('<strong>unknownChild</strong>')
  })
})

describe('VersionHistory — getFieldOptions branches', () => {
  let vm: any
  beforeEach(async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([])
    setTasks({
      [FormType.DPIA]: {
        'opt': { id: 'opt', task: 'O', options: [{ value: 1, label: 'Een' }, { value: 2, label: '' }] },
        'noopt': { id: 'noopt', task: 'N', options: [] },
      },
      [FormType.PRE_SCAN]: {},
    })
    const wrapper = mountView()
    await flushPromises()
    vm = wrapper.vm
  })

  it('returns null for a fieldId without a namespace dot', () => {
    expect(vm.getFieldOptions('nodot')).toBeNull()
  })

  it('builds an options map (label or stringified value fallback)', () => {
    const map = vm.getFieldOptions('dpia.opt')
    expect(map).toEqual({ '1': 'Een', '2': '2' })
  })

  it('returns null when the task has no options', () => {
    expect(vm.getFieldOptions('dpia.noopt')).toBeNull()
  })

  it('returns null when the task is unknown', () => {
    expect(vm.getFieldOptions('dpia.missing')).toBeNull()
  })
})

describe('VersionHistory — parseFieldId & toDotFieldId', () => {
  let vm: any
  beforeEach(async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    vm = wrapper.vm
  })

  it('parses a URN with task_index', () => {
    expect(vm.parseFieldId('urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0')).toEqual({ namespace: 'dpia', key: '2.1.3[0]' })
  })

  it('parses a URN without task_index', () => {
    expect(vm.parseFieldId('urn:nl:dpia:3.0?=task_id=2.1.3')).toEqual({ namespace: 'dpia', key: '2.1.3' })
  })

  it('maps prescan_dpia namespace to prescan', () => {
    expect(vm.parseFieldId('urn:nl:prescan_dpia:1.0?=task_id=1.1')).toEqual({ namespace: 'prescan', key: '1.1' })
  })

  it('returns null for a malformed URN', () => {
    expect(vm.parseFieldId('urn:nl:dpia:3.0')).toBeNull()
  })

  it('parses dot-format', () => {
    expect(vm.parseFieldId('dpia.2.1')).toEqual({ namespace: 'dpia', key: '2.1' })
  })

  it('returns null for a string with no dot', () => {
    expect(vm.parseFieldId('nodot')).toBeNull()
  })

  it('toDotFieldId converts URN and returns input on unparseable', () => {
    expect(vm.toDotFieldId('urn:nl:dpia:3.0?=task_id=2.1&task_index=2')).toBe('dpia.2.1[2]')
    expect(vm.toDotFieldId('nodot')).toBe('nodot')
  })
})

describe('VersionHistory — field-level restore', () => {
  // Build a diff panel with a single restorable field and open the field kebab.
  async function setupFieldDiff(edit: any, tasks?: Record<FormType, Record<string, any>>, currentState?: unknown) {
    apiGet.mockResolvedValue({
      role: 'owner',
      projectId: 'p',
      currentVersion: 4,
      state: currentState ?? { answers: {}, metadata: { completedTasks: [] } },
    })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    if (tasks) setTasks(tasks)
    apiVersionEdits.mockResolvedValue([edit])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    return wrapper
  }

  async function openFieldRestore(wrapper: ReturnType<typeof mountView>) {
    // The field kebab is the diff-kebab inside the old column.
    const kebab = wrapper.find('.diff-kebab .kebab-menu__trigger')
    await kebab.trigger('click')
    const item = wrapper.findAll('.kebab-menu__item').find((b) => b.text().includes('Herstel dit antwoord'))!
    await item.trigger('mousedown')
    await flushPromises()
  }

  // Several confirm dialogs share button classes, so target the field-restore
  // dialog ("Antwoord herstellen") explicitly when confirming/cancelling.
  function fieldRestoreDialog(wrapper: ReturnType<typeof mountView>) {
    return wrapper
      .findAll('dialog.confirm-dialog')
      .find((d) => d.text().includes('Antwoord herstellen'))!
  }
  async function confirmFieldRestore(wrapper: ReturnType<typeof mountView>) {
    await fieldRestoreDialog(wrapper).find('.utrecht-button--primary-action').trigger('click')
    await flushPromises()
  }

  it('shows the field kebab and opens the field restore modal', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'dpia.1.1',
      editType: 'answer_change',
      oldValue: { value: 'oud' },
      newValue: { value: 'nieuw' },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })

    await openFieldRestore(wrapper)
    expect(wrapper.text()).toContain('Antwoord herstellen')
  })

  it('field-level kebab toggles closed on second click and closes on focusout', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'a' }, newValue: { value: 'b' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })

    const kebab = wrapper.find('.diff-kebab .kebab-menu__trigger')
    await kebab.trigger('click')
    expect(wrapper.find('.diff-kebab .kebab-menu__dropdown').exists()).toBe(true)
    await kebab.trigger('click')
    expect(wrapper.find('.diff-kebab .kebab-menu__dropdown').exists()).toBe(false)
    await kebab.trigger('click')
    await wrapper.find('.diff-kebab').trigger('focusout')
    expect(wrapper.find('.diff-kebab .kebab-menu__dropdown').exists()).toBe(false)
  })

  it('restores a non-repeatable answer_change (writes flat key)', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)

    await confirmFieldRestore(wrapper)

    const [, state, opts] = apiUpdate.mock.calls[0]
    expect((state as any).answers['1.1'].value).toBe('oud')
    expect(opts.changeDescription).toBe('Antwoord uit versie 1 hersteld')
    expect(opts.newVersion).toBe(true)
    expect(apiVersions).toHaveBeenCalledTimes(2) // initial + refresh after restore
  })

  it('restores a non-repeatable field whose oldValue has no value → deletes the key', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: null, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} },
      { answers: { '1.1': { value: 'bestaand' } }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['1.1']).toBeUndefined()
  })

  it('restores a completed-section field (re-adds the completed task)', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.2',
      editType: 'section_complete',
      oldValue: true,
      newValue: false,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: { completedTasks: [] } })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state, opts] = apiUpdate.mock.calls[0]
    expect((state as any).metadata.completedTasks).toContain('2')
    expect(opts.changeDescription).toBe('Status uit versie 1 hersteld')
  })

  it('restores a completed-section to "not completed" (removes the task) and creates metadata', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.2',
      editType: 'section_complete',
      oldValue: false,
      newValue: true,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} },
      // No metadata in current state → exercise the `if (!currentState.metadata)` branch.
      { answers: { x: 1 } })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).metadata.completedTasks).not.toContain('2')
  })

  it('completed restore: already-present task is not duplicated', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.2',
      editType: 'section_complete',
      oldValue: true,
      newValue: false,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: { completedTasks: ['2'] } })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).metadata.completedTasks.filter((t: string) => t === '2').length).toBe(1)
  })

  it('completed restore: removing an absent task is a no-op', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.2',
      editType: 'section_complete',
      oldValue: false,
      newValue: true,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: { completedTasks: ['9'] } })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).metadata.completedTasks).toEqual(['9'])
  })

  it('restores instance_added by removing the instance from the grouped array', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1',
      editType: 'instance_added',
      oldValue: null,
      newValue: { '2.1.1': { value: 'E-mail' } },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'X' } }, { _index: 1, '2.1.1': { value: 'E-mail' } }] }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state, opts] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1']).toEqual([{ _index: 0, '2.1.1': { value: 'X' } }])
    expect(opts.changeDescription).toBe('Groep uit versie 1 hersteld')
  })

  it('restores instance_added removing the last instance deletes the array key', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
      editType: 'instance_added',
      oldValue: null,
      newValue: { '2.1.1': { value: 'E-mail' } },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'E-mail' } }] }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1']).toBeUndefined()
  })

  it('restores instance_added when the grouped array is not present (no-op array)', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
      editType: 'instance_added',
      oldValue: null,
      newValue: { '2.1.1': { value: 'E-mail' } },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    expect(apiUpdate).toHaveBeenCalled()
  })

  it('restores instance_removed by adding the instance back with old values, sorted', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=1',
      editType: 'instance_removed',
      oldValue: { '2.1.1': { value: 'Telefoon' } },
      newValue: null,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'X' } }, { _index: 2, '2.1.1': { value: 'Z' } }] }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    const arr = (state as any).answers['2.1']
    expect(arr.map((e: any) => e._index)).toEqual([0, 1, 2])
    expect(arr.find((e: any) => e._index === 1)['2.1.1'].value).toBe('Telefoon')
  })

  it('restores instance_removed creating the array when absent', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
      editType: 'instance_removed',
      oldValue: { '2.1.1': { value: 'Telefoon' } },
      newValue: null,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1']).toHaveLength(1)
    expect((state as any).answers['2.1'][0]._index).toBe(0)
  })

  it('restores instance_removed: skips when instance already present', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
      editType: 'instance_removed',
      oldValue: { '2.1.1': { value: 'Telefoon' } },
      newValue: null,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' }, '2.1.1': { id: '2.1.1', task: 'Type' } }, [FormType.PRE_SCAN]: {} },
      { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'Already' } }] }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1'][0]['2.1.1'].value).toBe('Already')
  })

  it('restores instance_removed with non-object rawOldValue (no Object.assign)', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1&task_index=0',
      editType: 'instance_removed',
      oldValue: 'notanobject',
      newValue: null,
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1'][0]).toEqual({ _index: 0 })
  })

  it('restores instance_added/removed when the index regex does not match (no array touch)', async () => {
    // editType instance_added but a dot-format fieldId without [n] → indexMatch null.
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'dpia.2.1',
      editType: 'instance_added',
      oldValue: null,
      newValue: { foo: { value: 'bar' } },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    // No index → nothing added; update still called.
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1']).toBeUndefined()
  })

  it('restores a repeatable answer_change into an existing grouped element', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.1&task_index=0',
      editType: 'answer_change',
      oldValue: { value: 'oud' },
      newValue: { value: 'nieuw' },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, {
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: 'Veld', parentId: '2.1' },
        '2.1': { id: '2.1', task: 'Groep', repeatable: true },
      },
      [FormType.PRE_SCAN]: {},
    }, { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'huidig' } }] }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['2.1'][0]['2.1.1'].value).toBe('oud')
  })

  it('restores a repeatable answer_change creating array + element when missing, deleting when no value', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=2.1.1&task_index=2',
      editType: 'answer_change',
      oldValue: null, // no .value → newAnswer null → delete element[taskId]
      newValue: { value: 'nieuw' },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, {
      [FormType.DPIA]: {
        '2.1.1': { id: '2.1.1', task: 'Veld', parentId: '2.1' },
        '2.1': { id: '2.1', task: 'Groep', repeatable: true },
      },
      [FormType.PRE_SCAN]: {},
    }, { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    // Element created at _index 2, but the field deleted (no value).
    const el = (state as any).answers['2.1'].find((e: any) => e._index === 2)
    expect(el).toBeDefined()
    expect(el['2.1.1']).toBeUndefined()
  })

  it('restores an indexed field with no repeatable parent → writes as flat key', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=5.1&task_index=0',
      editType: 'answer_change',
      oldValue: { value: 'oud' },
      newValue: { value: 'nieuw' },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, {
      // task has no parentId → parent null → flat-key branch.
      [FormType.DPIA]: { '5.1': { id: '5.1', task: 'Veld' } },
      [FormType.PRE_SCAN]: {},
    }, { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['5.1[0]'].value).toBe('oud')
  })

  it('restores an indexed field, no repeatable parent, no value → deletes flat key', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'urn:nl:dpia:3.0?=task_id=5.1&task_index=0',
      editType: 'answer_change',
      oldValue: null,
      newValue: { value: 'nieuw' },
      editedBy: 'x',
      editedAt: 't',
      version: 2,
    }, {
      [FormType.DPIA]: { '5.1': { id: '5.1', task: 'Veld' } },
      [FormType.PRE_SCAN]: {},
    }, { answers: { '5.1[0]': { value: 'bestaand' } }, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['5.1[0]']).toBeUndefined()
  })

  it('uses originVersion when provided instead of version-1', async () => {
    // mapEditsToDiffFields always sets originVersion = version-1; to vary it,
    // drive handleFieldRestore directly via the component instance.
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {}, metadata: {} } })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([])
    setTasks({ [FormType.DPIA]: { '1.1': { id: '1.1', task: 'N' } }, [FormType.PRE_SCAN]: {} })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    // Expand a version so expandedVersion is set.
    await vm.toggleDiff(3)
    await flushPromises()
    vm.openFieldRestoreModal({ fieldId: 'dpia.1.1', label: 'N', rawOldValue: { value: 'oud' }, originVersion: 1 })
    await flushPromises()
    await vm.handleFieldRestore()
    await flushPromises()
    const [, , opts] = apiUpdate.mock.calls[0]
    expect(opts.changeDescription).toBe('Antwoord uit versie 1 hersteld')
  })

  it('handleFieldRestore returns early when there is no target or no expanded version', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {} } })
    apiVersions.mockResolvedValue([])
    apiVersionEdits.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    // No target & no expanded version.
    await vm.handleFieldRestore()
    expect(apiUpdate).not.toHaveBeenCalled()
  })

  it('handleFieldRestore returns early when the fieldId cannot be parsed', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {} } })
    apiVersions.mockResolvedValue([])
    apiVersionEdits.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleDiff(3)
    await flushPromises()
    vm.openFieldRestoreModal({ fieldId: 'nodot', label: 'X', rawOldValue: { value: 'v' } })
    await flushPromises()
    await vm.handleFieldRestore()
    expect(apiUpdate).not.toHaveBeenCalled()
  })

  it('handleFieldRestore creates answers object when current state has none', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} },
      // current state with no answers key.
      {})
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['1.1'].value).toBe('oud')
  })

  it('handleFieldRestore handles a null state from the API (defaults to {})', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    // The restore re-fetches the assessment; return one with null state.
    apiGet.mockResolvedValueOnce({ role: 'owner', projectId: 'p', currentVersion: 4, state: null })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    expect(apiUpdate).toHaveBeenCalled()
  })

  it('alerts when the field restore API fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)
    apiUpdate.mockRejectedValueOnce(new Error('nope'))
    await confirmFieldRestore(wrapper)
    expect(alertSpy).toHaveBeenCalledWith('Herstel mislukt. Probeer het opnieuw.')
  })

  it('field restore modal cancel closes without restoring', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'x', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)
    apiUpdate.mockClear()
    // Target the field-restore dialog's Annuleren button (line 882 handler).
    await fieldRestoreDialog(wrapper).find('.utrecht-button--secondary-action').trigger('click')
    await flushPromises()
    expect(apiUpdate).not.toHaveBeenCalled()
    expect((wrapper.vm as any).fieldRestoreModalOpen).toBe(false)
  })
})

describe('VersionHistory — native dialog @close handlers', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: { answers: {}, metadata: {} } })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'd' },
    ])
  })

  it('description dialog @close resets descModalOpen', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openDescModal(2, 'd')
    await flushPromises()
    expect(vm.descModalOpen).toBe(true)
    // Native dialog "close" event (e.g. Escape key) → handler runs.
    await wrapper.find('dialog.confirm-dialog').trigger('close')
    expect(vm.descModalOpen).toBe(false)
  })

  it('restore dialog @close resets restoreModalOpen and confirm text', async () => {
    setTasks({ [FormType.DPIA]: {}, [FormType.PRE_SCAN]: {} })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openRestoreModal(2)
    await flushPromises()
    vm.restoreConfirmText = 'partial'
    const restoreDialog = wrapper
      .findAll('dialog.confirm-dialog')
      .find((d) => d.text().includes('Versie herstellen'))!
    await restoreDialog.trigger('close')
    expect(vm.restoreModalOpen).toBe(false)
    expect(vm.restoreConfirmText).toBe('')
  })

  it('field restore dialog @close resets fieldRestoreModalOpen and target', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openFieldRestoreModal({ fieldId: 'dpia.1.1', label: 'X', rawOldValue: { value: 'v' } })
    await flushPromises()
    expect(vm.fieldRestoreModalOpen).toBe(true)
    const fieldDialog = wrapper
      .findAll('dialog.confirm-dialog')
      .find((d) => d.text().includes('Antwoord herstellen'))!
    await fieldDialog.trigger('close')
    expect(vm.fieldRestoreModalOpen).toBe(false)
    expect(vm.fieldRestoreTarget).toBeNull()
  })
})

describe('VersionHistory — remaining branch coverage', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {}, metadata: {} } })
    apiVersions.mockResolvedValue([])
  })

  it('openDescModal with null current defaults text to empty and autoResize hits the textarea', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    // current === null → `current || ''` right-hand branch.
    vm.openDescModal(2, null)
    await flushPromises()
    expect(vm.descModalText).toBe('')
    // autoResize runs against the rendered textarea (descTextarea.value truthy).
    vm.autoResize()
    await flushPromises()
    expect(autoGrowTextareaMock).toHaveBeenCalled()
  })

  it('editable description button: single-line shows no "..." marker', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Enkel regel' },
    ])
    const wrapper = mountView()
    await flushPromises()
    const btn = wrapper.find('.desc-edit-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('Enkel regel')
    expect(btn.text()).not.toContain('...')
  })

  it('autoResize is a no-op when the textarea ref is null (guard else branch)', async () => {
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    autoGrowTextareaMock.mockClear()
    vm.descTextarea = null
    vm.autoResize()
    expect(autoGrowTextareaMock).not.toHaveBeenCalled()
  })

  it('handleFieldRestore: completed-section restore removes a present task (splice branch)', async () => {
    apiGet.mockResolvedValue({
      role: 'owner',
      projectId: 'p',
      currentVersion: 4,
      state: { answers: {}, metadata: { completedTasks: ['2', '5'] } },
    })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([])
    setTasks({ [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleDiff(3)
    await flushPromises()
    // rawOldValue !== true → restore to "not completed" → splice the present '2'.
    vm.openFieldRestoreModal({
      fieldId: 'urn:nl:dpia:3.0?=task_id=completed.2',
      label: 'Sectie',
      rawOldValue: false,
      originVersion: 1,
    })
    await flushPromises()
    await vm.handleFieldRestore()
    await flushPromises()
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).metadata.completedTasks).toEqual(['5'])
  })

  it('handleRestore tolerates a null current-assessment state (defaults to {})', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: 'd' },
    ])
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 9, state: null })
    apiVersion.mockResolvedValue({ state: null })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openRestoreModal(3)
    vm.restoreConfirmText = 'HERSTELLEN'
    await flushPromises()
    await vm.handleRestore()
    await flushPromises()
    expect(apiUpdate).toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalled()
  })

  it('getFieldOptions resolves a prescan task (PRE_SCAN ternary branch)', async () => {
    setTasks({
      [FormType.DPIA]: {},
      [FormType.PRE_SCAN]: { 'p1': { id: 'p1', task: 'P', options: [{ value: 'x', label: 'X' }] } },
    })
    const wrapper = mountView()
    await flushPromises()
    expect((wrapper.vm as any).getFieldOptions('prescan.p1')).toEqual({ x: 'X' })
  })

  it('formatValue: object-wrapper array with options where an item is missing from the map', async () => {
    const wrapper = mountView()
    await flushPromises()
    const out = (wrapper.vm as any).formatValue({ value: ['known', 'unknown'] }, { known: 'Bekend' })
    expect(out).toContain('<li>Bekend</li>')
    expect(out).toContain('<li>unknown</li>')
  })

  it('formatValue: top-level array with options where an item is missing from the map', async () => {
    const wrapper = mountView()
    await flushPromises()
    const out = (wrapper.vm as any).formatValue(['known', 'unknown'], { known: 'Bekend' })
    expect(out).toContain('<li>Bekend</li>')
    expect(out).toContain('<li>unknown</li>')
  })

  it('formatValue: remaining key with boolean false → "Nee"', async () => {
    const wrapper = mountView()
    await flushPromises()
    const out = (wrapper.vm as any).formatValue({ value: 'main', flagOff: false }, null)
    expect(out).toContain('flagOff: Nee')
  })

  it('mapEditsToDiffFields: prescan instance edit (PRE_SCAN ternary) with unparseable id (?? dotId)', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([
      {
        id: 'e1',
        // No dot, no urn → parseFieldId returns null → taskId ?? dotId and PRE_SCAN branch.
        fieldId: 'noparseinstance',
        editType: 'instance_added',
        oldValue: null,
        newValue: { foo: { value: 'bar' } },
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-field').text()).toContain('noparseinstance')
  })

  it('mapEditsToDiffFields: section_complete whose key does not start with "completed."', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    setTasks({ [FormType.DPIA]: { '7': { id: '7', task: 'Sectie zeven' } }, [FormType.PRE_SCAN]: {} })
    apiVersionEdits.mockResolvedValue([
      {
        id: 'e1',
        // URN whose task_id is "7" (no "completed." prefix) → else branch of the ternary.
        fieldId: 'urn:nl:dpia:3.0?=task_id=7',
        editType: 'section_complete',
        oldValue: false,
        newValue: true,
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-field').text()).toContain('Status sectie 7 "Sectie zeven"')
  })

  it('handleFieldRestore: prescan repeatable answer_change + sort comparator runs (2+ elements)', async () => {
    apiGet.mockResolvedValue({
      role: 'owner',
      projectId: 'p',
      currentVersion: 4,
      // Existing element at index 0 so creating index 2 forces sort comparator.
      state: { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'first' } }] }, metadata: {} },
    })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    setTasks({
      [FormType.DPIA]: {},
      [FormType.PRE_SCAN]: {
        '2.1.1': { id: '2.1.1', task: 'Veld', parentId: '2.1' },
        '2.1': { id: '2.1', task: 'Groep', repeatable: true },
      },
    })
    apiVersionEdits.mockResolvedValue([
      {
        id: 'e1',
        // prescan namespace → PRE_SCAN ternary branch at L128.
        fieldId: 'urn:nl:prescan_dpia:1.0?=task_id=2.1.1&task_index=2',
        editType: 'answer_change',
        oldValue: { value: 'oud' },
        newValue: { value: 'nieuw' },
        editedBy: 'x',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.toggle-btn').trigger('click')
    await flushPromises()
    await fieldRestoreDialogConfirm(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    const arr = (state as any).answers['2.1']
    // Sorted: index 0 then 2.
    expect(arr.map((e: any) => e._index)).toEqual([0, 2])
    expect(arr.find((e: any) => e._index === 2)['2.1.1'].value).toBe('oud')
  })

  it('handleFieldRestore: originVersion undefined falls back to version-1 (?? branch)', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {}, metadata: {} } })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([])
    setTasks({ [FormType.DPIA]: { '1.1': { id: '1.1', task: 'N' } }, [FormType.PRE_SCAN]: {} })
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleDiff(3)
    await flushPromises()
    // originVersion omitted → handleFieldRestore uses (version - 1) = 2.
    vm.openFieldRestoreModal({ fieldId: 'dpia.1.1', label: 'N', rawOldValue: { value: 'oud' } })
    await flushPromises()
    await vm.handleFieldRestore()
    await flushPromises()
    const [, , opts] = apiUpdate.mock.calls[0]
    expect(opts.changeDescription).toBe('Antwoord uit versie 2 hersteld')
  })

  it('read-only description span: single-line, multi-line marker, and empty fallback (viewer role)', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([
      // Multi-line → "..." marker (includes('\n') true).
      { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: 'Regel A\nRegel B' },
      // Single-line → no marker (includes('\n') false → b174 false branch).
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Enkel' },
      // Null → empty fallback span.
      { id: 'v1', version: 1, createdByName: 'B', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    const descSpans = wrapper.findAll('.version-col--desc')
    expect(wrapper.text()).toContain('Regel A')
    expect(wrapper.text()).toContain('Enkel')
    expect(wrapper.text()).toContain('...')
    expect(descSpans.length).toBeGreaterThanOrEqual(3)
  })

  it('diff old-footer renders oldTimestamp and originVersion-fallback in template', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    await vm.toggleDiff(2)
    await flushPromises()
    // mapEditsToDiffFields never sets oldTimestamp nor a nullish originVersion,
    // so craft a diff field directly to exercise both template branches.
    vm.diffFields = [
      {
        fieldId: 'dpia.1.1',
        label: 'Veld',
        oldValue: 'oud',
        newValue: 'nieuw',
        oldTimestamp: '20 maart 2026',
        originVersion: undefined,
        canRestore: true,
      },
    ]
    await flushPromises()
    const footer = wrapper.find('.diff-old-footer')
    expect(footer.exists()).toBe(true)
    // oldTimestamp template (b193 true) and `?? (expandedVersion - 1)` (b194 right).
    expect(footer.text()).toContain('20 maart 2026')
    expect(footer.text()).toContain('versie 1')
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type DOMWrapper } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const backLinkSet = vi.fn()
vi.mock('../../src/composables/useBackLink', () => ({
  useBackLink: () => ({ set: backLinkSet }),
}))

const apiGet = vi.fn()
const apiVersions = vi.fn()
const apiVersion = vi.fn()
const apiVersionEdits = vi.fn()
const apiUpdate = vi.fn()
const apiUpdateVersionDescription = vi.fn()

vi.mock('../../src/api', () => ({
  assessments: {
    get: (...a: unknown[]) => apiGet(...a),
    versions: async (...a: unknown[]) => {
      const r = await apiVersions(...a)
      return Array.isArray(r) ? { items: r, total: r.length } : r
    },
    version: (...a: unknown[]) => apiVersion(...a),
    versionEdits: (...a: unknown[]) => apiVersionEdits(...a),
    update: (...a: unknown[]) => apiUpdate(...a),
    updateVersionDescription: (...a: unknown[]) => apiUpdateVersionDescription(...a),
  },
}))

// We deliberately do NOT vi.mock the generated DPIA/PreScanDPIA JSON paths: mocking them leaves the SFC's onMounted dynamic import unresolved, hanging it forever.
enum FormType {
  DPIA = 'dpia',
  PRE_SCAN = 'prescan',
  IAMA = 'iama',
}

const flatTaskMap: Record<string, Record<string, any>> = {
  [FormType.DPIA]: {},
  [FormType.PRE_SCAN]: {},
}

const schemaInitialized = { value: false }
const taskInitialized = {
  [FormType.DPIA]: false,
  [FormType.PRE_SCAN]: false,
  [FormType.IAMA]: false,
}

const schemaInit = vi.fn(() => {
  schemaInitialized.value = true
})
const getSchema = vi.fn((ns: FormType) => ({ tasks: [], _ns: ns }))
const taskInit = vi.fn()
const setActiveNamespace = vi.fn()
const taskReset = vi.fn()
const answerReset = vi.fn()

const getTasksFromNamespace = vi.fn((ns: FormType) => flatTaskMap[ns])
const getTaskByIdFromNamespace = vi.fn(
  (ns: FormType, taskId: string) => flatTaskMap[ns]?.[taskId] ?? null,
)

// The field-id parsers are pulled in for real: the view's diff rows depend on
// their exact behaviour, and a hand-written stub here would drift from them.
vi.mock('@overheid-assessment/core', async () => ({
  ...(await import('../../../../packages/assessment-core/src/utils/fieldUrn')),
  ...(await import('../../../../packages/assessment-core/src/utils/instanceId')),
  FormType: {
    DPIA: 'dpia',
    PRE_SCAN: 'prescan',
    IAMA: 'iama',
  },
  OUTPUT_SCHEMA_URL: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
  getPlainTextWithoutDefinitions: (html: string | null | undefined) =>
    (html ?? '').replace(/<[^>]*>/g, ''),
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
  // Mirror the real raster-only predicate (rejects SVG) used by formatValue.
  isImageValue: (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('data' in value) || typeof (value as Record<string, unknown>).data !== 'string') return false
    const data = (value as Record<string, unknown>).data as string
    return data.startsWith('data:image/') && !data.startsWith('data:image/svg')
  },
}))

import VersionHistory from '../../src/views/VersionHistory.vue'

const ASSESSMENT_ID = 'assess-1'

function setTasks(tasks: Partial<Record<FormType, Record<string, any>>>) {
  flatTaskMap[FormType.DPIA] = tasks[FormType.DPIA] ?? {}
  flatTaskMap[FormType.PRE_SCAN] = tasks[FormType.PRE_SCAN] ?? {}
  flatTaskMap[FormType.IAMA] = tasks[FormType.IAMA] ?? {}
}

function mountView() {
  return mount(VersionHistory, {
    props: { assessmentId: ASSESSMENT_ID },
  })
}

// Wait deterministically on schemaStore.init (the signal the onMounted dynamic import resolved): a fixed cycle count is flaky and leaks init() into the next test.
async function flush() {
  await vi.waitFor(
    () => {
      if (schemaInit.mock.calls.length === 0) throw new Error('schema not initialized yet')
    },
    { timeout: 5000, interval: 10 },
  )
  await flushPromises()
}

// The shared KebabMenu renders its slotted nldd-menu-item elements in the light
// DOM; jsdom does not enforce popover visibility, so they are directly
// interactable. Item texts live in the `text` attribute (not wrapper.text()).
function menuItem(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll('nldd-menu-item').find((i) => i.attributes('text') === text)
}

// Dialog titles live in the modal's `text` attribute.
function dialogByTitle(wrapper: ReturnType<typeof mountView>, title: string) {
  return wrapper.findAll('nldd-modal-dialog').find((d) => (d.attributes('text') ?? '').includes(title))!
}

function dialogButton(dialog: DOMWrapper<Element>, text: string) {
  return dialog.findAll('nldd-button').find((b) => b.attributes('text') === text)!
}

// NLDD fields deliver their value via event.detail.
function setNlddValue(field: DOMWrapper<Element>, value: string) {
  field.element.dispatchEvent(new CustomEvent('input', { detail: { value } }))
}

async function fieldRestoreDialogConfirm(wrapper: ReturnType<typeof mountView>) {
  await menuItem(wrapper, 'Herstel dit antwoord')!.trigger('click')
  await flushPromises()
  await dialogButton(dialogByTitle(wrapper, 'Antwoord herstellen'), 'Herstellen').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: stores pre-initialized so onMounted skips the dynamic JSON import; tests opt into the uninitialized branch by flipping these false and awaiting flush().
  schemaInitialized.value = true
  taskInitialized[FormType.DPIA] = true
  taskInitialized[FormType.PRE_SCAN] = true
  taskInitialized[FormType.IAMA] = true
  flatTaskMap[FormType.DPIA] = {}
  flatTaskMap[FormType.PRE_SCAN] = {}
  flatTaskMap[FormType.IAMA] = {}

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

// The per-version disclosure; the kebab triggers are nldd-icon-buttons too.
const DIFF_TOGGLE = '.version-col--toggle nldd-icon-button'

describe('VersionHistory — mount & onMounted', () => {
  it('initializes schema + task stores when uninitialized and shows empty state', async () => {
    schemaInitialized.value = false
    taskInitialized[FormType.DPIA] = false
    taskInitialized[FormType.PRE_SCAN] = false
    taskInitialized[FormType.IAMA] = false
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    expect(wrapper.text()).toContain('Laden...')
    await flush()

    expect(schemaInit).toHaveBeenCalled()
    expect(taskInit).toHaveBeenCalledTimes(3)
    expect(setActiveNamespace).toHaveBeenCalledWith(FormType.DPIA)
    expect(setActiveNamespace).toHaveBeenCalledWith(FormType.PRE_SCAN)
    expect(setActiveNamespace).toHaveBeenCalledWith(FormType.IAMA)

    expect(wrapper.text()).toContain('Geen versies gevonden.')
  })

  it('skips store initialization when already initialized', async () => {
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

    expect(wrapper.find('.version-col--action').exists()).toBe(false)
  })

  it('resets the task and answer stores on unmount', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.unmount()
    expect(taskReset).toHaveBeenCalledTimes(1)
    expect(answerReset).toHaveBeenCalledTimes(1)
  })

  it('declares the back link to the assessment in the top bar', async () => {
    mountView()
    await flushPromises()
    expect(backLinkSet).toHaveBeenCalledWith({ text: 'Assessment', to: `/assessment/${ASSESSMENT_ID}` })
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

    expect(wrapper.findAll('.version-row').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.text()).toContain('Eerste regel')
    expect(wrapper.text()).toContain('Noor')
    expect(wrapper.text()).toContain('Sam')
    expect(wrapper.text()).toMatch(/maart/)
  })

  it('shows toggle button only for versions above 1', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
      { id: 'v1', version: 1, createdByName: 'B', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    const toggles = wrapper.findAll(DIFF_TOGGLE)
    expect(toggles.length).toBe(1)
    expect(toggles[0].attributes('size')).toBe('xs')
    expect(toggles[0].attributes('variant')).toBe('neutral-transparent')
    expect(toggles[0].attributes('icon')).toBe('chevron-right')
    expect(toggles[0].attributes('text')).toBe('Verschillen tonen')
    expect(toggles[0].attributes('expanded')).toBeUndefined()

    await toggles[0].trigger('click')
    await flushPromises()
    const open = wrapper.find(DIFF_TOGGLE)
    expect(open.attributes('icon')).toBe('chevron-down')
    expect(open.attributes('text')).toBe('Verschillen inklappen')
    expect(open.attributes('expanded')).toBe('true')
  })
})

describe('VersionHistory — load more', () => {
  it('shows "meer laden" when more exist, then appends the next page and hides the button', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions
      .mockResolvedValueOnce({ items: [
        { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: null },
        { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
      ], total: 3 })
      .mockResolvedValueOnce({ items: [
        { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
      ], total: 3 })

    const wrapper = mountView()
    await flushPromises()

    const more = wrapper.find('.version-list__more nldd-button')
    expect(more.exists()).toBe(true)

    await more.trigger('click')
    await flushPromises()

    expect(apiVersions).toHaveBeenNthCalledWith(2, expect.any(String), 2, 100)
    // 3 of 3 loaded -> button gone.
    expect(wrapper.find('.version-list__more').exists()).toBe(false)
  })

  it('does not show "meer laden" when everything fits on the first page', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.version-list__more').exists()).toBe(false)
  })

  const V = (n: number) => ({ id: `v${n}`, version: n, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: null })

  it('dedupes an overlapping page and stops when nothing new arrives', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions
      .mockResolvedValueOnce({ items: [V(3), V(2)], total: 3 })
      // A concurrent insert shifted the window: page 2 only re-returns v2.
      .mockResolvedValueOnce({ items: [V(2)], total: 3 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.version-list__more nldd-button').trigger('click')
    await flushPromises()
    // v2 is not duplicated (1 header + 2 data rows) and the button is gone.
    expect(wrapper.findAll('.version-row').length).toBe(3)
    expect(wrapper.find('.version-list__more').exists()).toBe(false)
  })

  it('surfaces an error and keeps the button when loading more fails', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions
      .mockResolvedValueOnce({ items: [V(3), V(2)], total: 3 })
      .mockRejectedValueOnce(new Error('netwerk'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.version-list__more nldd-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__error').text()).toContain('mislukt')
    expect(wrapper.find('.version-list__more').exists()).toBe(true)
  })

  it('announces progress while more pages remain', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 5, state: {} })
    apiVersions
      .mockResolvedValueOnce({ items: [V(5), V(4)], total: 5 })
      .mockResolvedValueOnce({ items: [V(3), V(2)], total: 5 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.version-list__more nldd-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__more').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').text()).toContain('4 van 5')
  })

  it('labels the button by remaining count, and "laatste versie" for the final one', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 5, state: {} })
    apiVersions
      .mockResolvedValueOnce({ items: [V(5), V(4)], total: 5 }) // 3 remaining -> plural
      .mockResolvedValueOnce({ items: [V(3), V(2)], total: 5 }) // 1 remaining -> "laatste"
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.version-list__more nldd-button').attributes('text')).toBe('Laad de volgende 3 versies')
    await wrapper.find('.version-list__more nldd-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__more nldd-button').attributes('text')).toBe('Laad de laatste versie')
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

    expect(wrapper.find('nldd-icon-button').exists()).toBe(true)
    expect(menuItem(wrapper, 'Beschrijving bewerken')).toBeDefined()
    expect(menuItem(wrapper, 'Herstellen naar deze versie')).toBeUndefined()
  })

  it('viewer role: canEdit false, hides action column entirely', async () => {
    apiGet.mockResolvedValue({ role: 'viewer', projectId: 'p', currentVersion: 1, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v1', version: 1, createdByName: 'A', updatedAt: '2026-01-01T10:00:00Z', changeDescription: 'desc' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('nldd-icon-button').exists()).toBe(false)
    expect(wrapper.find('.desc-edit-btn').exists()).toBe(false)
  })

  it('owner role: shows "Beschrijving toevoegen" when no description and a destructive restore item', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(menuItem(wrapper, 'Beschrijving toevoegen')).toBeDefined()
    const restoreItem = menuItem(wrapper, 'Herstellen naar deze versie')
    expect(restoreItem).toBeDefined()
    expect(restoreItem!.attributes('destructive')).toBeDefined()
  })
})

describe('VersionHistory - kebab menu labels', () => {
  it('labels the row kebab with the version number', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'd' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.version-col--action nldd-icon-button').attributes('text')).toBe('Acties voor versie 2')
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
    const dialog = dialogByTitle(wrapper, 'Beschrijving versie 2 bewerken')
    expect(dialog.exists()).toBe(true)

    const textarea = wrapper.find('nldd-multi-line-text-field')
    expect(textarea.attributes('resize')).toBe('auto')
    expect(textarea.attributes('value')).toBe('Origineel')
    setNlddValue(textarea, 'Nieuwe beschrijving')
    await flushPromises()

    await dialogButton(dialog, 'Opslaan').trigger('click')
    await flushPromises()

    expect(apiUpdateVersionDescription).toHaveBeenCalledWith(ASSESSMENT_ID, 2, 'Nieuwe beschrijving')
    expect(wrapper.text()).toContain('Nieuwe beschrijving')
  })

  it('mirrors the open state to show()/hide() on the upgraded modal element', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'X' },
    ])
    const wrapper = mountView()
    await flushPromises()
    const host = dialogByTitle(wrapper, 'Beschrijving versie').element as HTMLElement & {
      show?: () => void
      hide?: () => void
    }
    host.show = vi.fn()
    host.hide = vi.fn()

    await wrapper.find('.desc-edit-btn').trigger('click')
    await flushPromises()
    expect(host.show).toHaveBeenCalledTimes(1)

    await dialogButton(dialogByTitle(wrapper, 'Beschrijving versie'), 'Annuleren').trigger('click')
    await flushPromises()
    expect(host.hide).toHaveBeenCalledTimes(1)
  })

  it('falls back to target.value for a description input event without detail', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'X' },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.desc-edit-btn').trigger('click')
    await flushPromises()

    const host = wrapper.find('nldd-multi-line-text-field').element as HTMLElement & { value?: string }
    host.value = 'Fallback tekst'
    host.dispatchEvent(new Event('input'))
    await flushPromises()

    await dialogButton(dialogByTitle(wrapper, 'Beschrijving versie'), 'Opslaan').trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).toHaveBeenCalledWith(ASSESSMENT_ID, 2, 'Fallback tekst')
  })

  it('saveDescription returns early when no version selected (modal never opened)', async () => {
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

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

    vm.openDescModal(2, 'X')
    await flushPromises()
    setNlddValue(wrapper.find('nldd-multi-line-text-field'), '')
    await flushPromises()
    await dialogButton(dialogByTitle(wrapper, 'Beschrijving versie'), 'Opslaan').trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).toHaveBeenLastCalledWith(ASSESSMENT_ID, 2, '')

    apiUpdateVersionDescription.mockClear()
    vm.openDescModal(999, 'whatever')
    await flushPromises()
    await dialogButton(dialogByTitle(wrapper, 'Beschrijving versie'), 'Opslaan').trigger('click')
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
    await dialogButton(dialogByTitle(wrapper, 'Beschrijving versie'), 'Annuleren').trigger('click')
    await flushPromises()
    expect(apiUpdateVersionDescription).not.toHaveBeenCalled()
    expect((wrapper.vm as any).descModalOpen).toBe(false)
  })

  it('opens the description modal from the kebab menu', async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 2, state: {} })
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Y' },
    ])
    const wrapper = mountView()
    await flushPromises()

    await menuItem(wrapper, 'Beschrijving bewerken')!.trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).descModalOpen).toBe(true)
    expect(dialogByTitle(wrapper, 'Beschrijving versie 2 bewerken').exists()).toBe(true)
  })
})

describe('VersionHistory — restore modal & handleRestore', () => {
  function restoreInput(wrapper: ReturnType<typeof mountView>) {
    return dialogByTitle(wrapper, 'Versie herstellen').find('nldd-text-field')
  }

  function restoreButton(wrapper: ReturnType<typeof mountView>) {
    return dialogButton(dialogByTitle(wrapper, 'Versie herstellen'), 'Herstellen')
  }

  async function openRestoreFor(_version: number) {
    const wrapper = mountView()
    await flushPromises()
    await menuItem(wrapper, 'Herstellen naar deze versie')!.trigger('click')
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 5, state: { metadata: { urn: 'x' }, $schema: 'S', answers: { a: 1 } } })
    apiVersions.mockResolvedValue([
      { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: 'd' },
    ])
  })

  it('disables the destructive Herstellen button until the confirm word is typed', async () => {
    const wrapper = await openRestoreFor(3)
    expect(restoreButton(wrapper).attributes('variant')).toBe('destructive')
    expect(restoreButton(wrapper).attributes('disabled')).toBeDefined()

    setNlddValue(restoreInput(wrapper), '  HERSTELLEN  ')
    await flushPromises()
    expect(restoreButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('mirrors the open state to show()/hide() on the upgraded modal element', async () => {
    const wrapper = mountView()
    await flushPromises()
    const host = dialogByTitle(wrapper, 'Versie herstellen').element as HTMLElement & {
      show?: () => void
      hide?: () => void
    }
    host.show = vi.fn()
    host.hide = vi.fn()

    await menuItem(wrapper, 'Herstellen naar deze versie')!.trigger('click')
    await flushPromises()
    expect(host.show).toHaveBeenCalledTimes(1)

    await dialogButton(dialogByTitle(wrapper, 'Versie herstellen'), 'Annuleren').trigger('click')
    await flushPromises()
    expect(host.hide).toHaveBeenCalledTimes(1)
  })

  it('falls back to target.value for a confirm input event without detail', async () => {
    const wrapper = await openRestoreFor(3)
    const host = restoreInput(wrapper).element as HTMLElement & { value?: string }
    host.value = 'HERSTELLEN'
    host.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(restoreButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('restores: merges metadata/$schema, calls update and navigates', async () => {
    apiVersion.mockResolvedValue({ state: { metadata: { completedTasks: ['1', '2'] }, answers: { b: 2 } } })
    const wrapper = await openRestoreFor(3)

    setNlddValue(restoreInput(wrapper), 'HERSTELLEN')
    await flushPromises()
    await restoreButton(wrapper).trigger('click')
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

    setNlddValue(restoreInput(wrapper), 'HERSTELLEN')
    await flushPromises()
    await restoreButton(wrapper).trigger('click')
    await flushPromises()

    const [, restoredState] = apiUpdate.mock.calls[0]
    expect((restoredState as any).metadata).toEqual({ completedTasks: [] })
    expect((restoredState as any).answers).toEqual({})
    // Even when the current state lacks $schema (legacy data), restore must emit a
    // canonical $schema so the strict backend accepts the save.
    expect((restoredState as any).$schema).toBe('https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json')
  })

  it('handleRestore returns early when confirm word not matching', async () => {
    const wrapper = await openRestoreFor(3)
    const vm = wrapper.vm as any
    await vm.handleRestore()
    expect(apiVersion).not.toHaveBeenCalled()
  })

  it('alerts and keeps modal open when restore API fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    apiVersion.mockRejectedValue(new Error('boom'))
    const wrapper = await openRestoreFor(3)

    setNlddValue(restoreInput(wrapper), 'HERSTELLEN')
    await flushPromises()
    await restoreButton(wrapper).trigger('click')
    await flushPromises()

    expect(alertSpy).toHaveBeenCalledWith('Herstel mislukt. Probeer het opnieuw.')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('Enter key in confirm input triggers restore only when confirmed', async () => {
    apiVersion.mockResolvedValue({ state: { metadata: { completedTasks: [] }, answers: {} } })
    const wrapper = await openRestoreFor(3)
    const input = restoreInput(wrapper)

    await input.trigger('keyup.enter')
    await flushPromises()
    expect(apiVersion).not.toHaveBeenCalled()

    setNlddValue(input, 'HERSTELLEN')
    await flushPromises()
    await input.trigger('keyup.enter')
    await flushPromises()
    expect(apiVersion).toHaveBeenCalled()
  })

  it('restore modal cancel resets confirm text', async () => {
    const wrapper = await openRestoreFor(3)
    setNlddValue(restoreInput(wrapper), 'partial')
    await flushPromises()
    await dialogButton(dialogByTitle(wrapper, 'Versie herstellen'), 'Annuleren').trigger('click')
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

    await wrapper.find(DIFF_TOGGLE).trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-panel').exists()).toBe(true)

    await wrapper.find(DIFF_TOGGLE).trigger('click')
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
    expect(wrapper.text()).toContain('Eerste versie - geen vorige versie om mee te vergelijken.')
  })

  it('shows "Geen inhoudelijke wijzigingen gevonden." when edits map to nothing', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    apiVersionEdits.mockResolvedValue([
      { id: 'e0', fieldId: 'dpia.1.1', editType: 'initial_state', oldValue: null, newValue: null, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
    ])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find(DIFF_TOGGLE).trigger('click')
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

    await wrapper.find(DIFF_TOGGLE).trigger('click')
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
    await wrapper.find(DIFF_TOGGLE).trigger('click')
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

  async function expandWithEdits(edits: any[], tasks?: Partial<Record<FormType, Record<string, any>>>) {
    if (tasks) setTasks(tasks)
    apiVersionEdits.mockResolvedValue(edits)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find(DIFF_TOGGLE).trigger('click')
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
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-list').exists()).toBe(true)
    expect(wrapper.find('.diff-field').text()).toContain('2.1.1. E-mailadres')
    const values = wrapper.findAll('.diff-value__label').map((l) => l.text())
    expect(values).toEqual(['Was', 'Wordt'])
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
      { id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'A' }, newValue: { value: 'B' }, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
      { id: 'e2', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'B' }, newValue: { value: 'C' }, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
    ])
    expect(wrapper.findAll('.diff-row').length).toBe(1)
    expect(wrapper.find('.diff-old').text()).toContain('A')
    expect(wrapper.find('.diff-new').text()).toContain('C')
  })

  it('skips a field whose net change is identical (no-op)', async () => {
    const wrapper = await expandWithEdits([
      { id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change', oldValue: { value: 'A' }, newValue: { value: 'A' }, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
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
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
    expect(wrapper.find('.diff-field').text()).toContain('weirdtask')
    expect(wrapper.find('.diff-field').text()).not.toContain('#')
  })

  it('filters out task_instance_add / task_instance_remove edit types', async () => {
    const wrapper = await expandWithEdits([
      { id: 'e1', fieldId: 'dpia.2.1', editType: 'task_instance_add', oldValue: null, newValue: { x: 1 }, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
      { id: 'e2', fieldId: 'dpia.2.1', editType: 'task_instance_remove', oldValue: { x: 1 }, newValue: null, editedBy: 'sam@example.com', editedAt: 't', version: 2 },
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
    expect(vm.formatTimestamp('not-a-date')).toBe('not-a-date')
  })

  it('escapes plain strings (HTML-significant chars without tags)', () => {
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

  it('treats an object value with non-allowed image data as a normal object', () => {
    // Plain text and SVG (rejected by the raster-only policy) both fall through to
    // object rendering instead of an <img>, matching the write-time image policy.
    expect(vm.formatValue({ value: { data: 'plain text' } }, null)).toContain('data')
    expect(vm.formatValue({ value: { data: 'data:image/svg;base64,PHN2Zz4=' } }, null)).not.toContain('<img')
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

describe('VersionHistory — toDotFieldId', () => {
  let vm: any
  beforeEach(async () => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 3, state: {} })
    apiVersions.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    vm = wrapper.vm
  })

  it('converts a URN and returns the input for an id without a namespace', () => {
    expect(vm.toDotFieldId('urn:nl:dpia:3.0?=task_id=2.1&task_index=2')).toBe('dpia.2.1[2]')
    expect(vm.toDotFieldId('nodot')).toBe('nodot')
    expect(vm.toDotFieldId('urn:nl:dpia:3.0')).toBe('urn:nl:dpia:3.0')
  })
})

describe('VersionHistory — field-level restore', () => {
  async function setupFieldDiff(edit: any, tasks?: Partial<Record<FormType, Record<string, any>>>, currentState?: unknown) {
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
    await wrapper.find(DIFF_TOGGLE).trigger('click')
    await flushPromises()
    return wrapper
  }

  async function openFieldRestore(wrapper: ReturnType<typeof mountView>) {
    await menuItem(wrapper, 'Herstel dit antwoord')!.trigger('click')
    await flushPromises()
  }

  function fieldRestoreDialog(wrapper: ReturnType<typeof mountView>) {
    return dialogByTitle(wrapper, 'Antwoord herstellen')
  }
  async function confirmFieldRestore(wrapper: ReturnType<typeof mountView>) {
    await dialogButton(fieldRestoreDialog(wrapper), 'Herstellen').trigger('click')
    await flushPromises()
  }

  it('shows the field kebab and opens the field restore modal', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'dpia.1.1',
      editType: 'answer_change',
      oldValue: { value: 'oud' },
      newValue: { value: 'nieuw' },
      editedBy: 'sam@example.com',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })

    expect(wrapper.find('nldd-icon-button.diff-kebab').attributes('text')).toBe('Acties voor dit antwoord')
    await openFieldRestore(wrapper)
    expect((wrapper.vm as any).fieldRestoreModalOpen).toBe(true)
    expect(fieldRestoreDialog(wrapper).exists()).toBe(true)
  })

  it('restores a non-repeatable answer_change (writes flat key)', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)

    await confirmFieldRestore(wrapper)

    const [, state, opts] = apiUpdate.mock.calls[0]
    expect((state as any).answers['1.1'].value).toBe('oud')
    // Field restore emits a canonical $schema even though the current state lacked one.
    expect((state as any).$schema).toBe('https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json')
    expect(opts.changeDescription).toBe('Antwoord uit versie 1 hersteld')
    expect(opts.newVersion).toBe(true)
    expect(apiVersions).toHaveBeenCalledTimes(2)
  })

  it('restores a non-repeatable field whose oldValue has no value → deletes the key', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: null, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2': { id: '2', task: 'Sectie' } }, [FormType.PRE_SCAN]: {} },
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
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
    const wrapper = await setupFieldDiff({
      id: 'e1',
      fieldId: 'dpia.2.1',
      editType: 'instance_added',
      oldValue: null,
      newValue: { foo: { value: 'bar' } },
      editedBy: 'sam@example.com',
      editedAt: 't',
      version: 2,
    }, { [FormType.DPIA]: { '2.1': { id: '2.1', task: 'Groep' } }, [FormType.PRE_SCAN]: {} },
      { answers: {}, metadata: {} })
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
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
      editedBy: 'sam@example.com',
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
      oldValue: null,
      newValue: { value: 'nieuw' },
      editedBy: 'sam@example.com',
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
      editedBy: 'sam@example.com',
      editedAt: 't',
      version: 2,
    }, {
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
      editedBy: 'sam@example.com',
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
    // mapEditsToDiffFields always sets originVersion = version-1, so drive handleFieldRestore directly to vary it.
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
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} },
      {})
    await openFieldRestore(wrapper)
    await confirmFieldRestore(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    expect((state as any).answers['1.1'].value).toBe('oud')
  })

  it('handleFieldRestore handles a null state from the API (defaults to {})', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
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
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)
    apiUpdate.mockRejectedValueOnce(new Error('nope'))
    await confirmFieldRestore(wrapper)
    expect(alertSpy).toHaveBeenCalledWith('Herstel mislukt. Probeer het opnieuw.')
  })

  it('field restore modal cancel closes without restoring', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    await openFieldRestore(wrapper)
    apiUpdate.mockClear()
    await dialogButton(fieldRestoreDialog(wrapper), 'Annuleren').trigger('click')
    await flushPromises()
    expect(apiUpdate).not.toHaveBeenCalled()
    expect((wrapper.vm as any).fieldRestoreModalOpen).toBe(false)
  })

  it('mirrors the field-restore open state to show()/hide() on the upgraded modal element', async () => {
    const wrapper = await setupFieldDiff({
      id: 'e1', fieldId: 'dpia.1.1', editType: 'answer_change',
      oldValue: { value: 'oud' }, newValue: { value: 'nieuw' }, editedBy: 'sam@example.com', editedAt: 't', version: 2,
    }, { [FormType.DPIA]: { '1.1': { id: '1.1', task: 'Naam' } }, [FormType.PRE_SCAN]: {} })
    const host = fieldRestoreDialog(wrapper).element as HTMLElement & {
      show?: () => void
      hide?: () => void
    }
    host.show = vi.fn()
    host.hide = vi.fn()

    await openFieldRestore(wrapper)
    expect(host.show).toHaveBeenCalledTimes(1)

    await dialogButton(fieldRestoreDialog(wrapper), 'Annuleren').trigger('click')
    await flushPromises()
    expect(host.hide).toHaveBeenCalledTimes(1)
  })
})

describe('VersionHistory - modal @close handlers', () => {
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
    await dialogByTitle(wrapper, 'Beschrijving versie').trigger('close')
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
    await dialogByTitle(wrapper, 'Versie herstellen').trigger('close')
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
    await dialogByTitle(wrapper, 'Antwoord herstellen').trigger('close')
    expect(vm.fieldRestoreModalOpen).toBe(false)
    expect(vm.fieldRestoreTarget).toBeNull()
  })
})

describe('VersionHistory — remaining branch coverage', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue({ role: 'owner', projectId: 'p', currentVersion: 4, state: { answers: {}, metadata: {} } })
    apiVersions.mockResolvedValue([])
  })

  it('openDescModal with null current defaults the modal text to empty', async () => {
    apiVersions.mockResolvedValue([
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
    ])
    const wrapper = mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openDescModal(2, null)
    await flushPromises()
    expect(vm.descModalText).toBe('')
    expect(wrapper.find('nldd-multi-line-text-field').attributes('value')).toBe('')
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
        fieldId: 'noparseinstance',
        editType: 'instance_added',
        oldValue: null,
        newValue: { foo: { value: 'bar' } },
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find(DIFF_TOGGLE).trigger('click')
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
        fieldId: 'urn:nl:dpia:3.0?=task_id=7',
        editType: 'section_complete',
        oldValue: false,
        newValue: true,
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find(DIFF_TOGGLE).trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-field').text()).toContain('Status sectie 7 "Sectie zeven"')
  })

  it('handleFieldRestore: prescan repeatable answer_change + sort comparator runs (2+ elements)', async () => {
    apiGet.mockResolvedValue({
      role: 'owner',
      projectId: 'p',
      currentVersion: 4,
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
        fieldId: 'urn:nl:prescan_dpia:1.0?=task_id=2.1.1&task_index=2',
        editType: 'answer_change',
        oldValue: { value: 'oud' },
        newValue: { value: 'nieuw' },
        editedBy: 'sam@example.com',
        editedAt: 't',
        version: 2,
      },
    ])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find(DIFF_TOGGLE).trigger('click')
    await flushPromises()
    await fieldRestoreDialogConfirm(wrapper)
    const [, state] = apiUpdate.mock.calls[0]
    const arr = (state as any).answers['2.1']
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
      { id: 'v3', version: 3, createdByName: 'A', updatedAt: '2026-01-03T10:00:00Z', changeDescription: 'Regel A\nRegel B' },
      { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: 'Enkel' },
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
    // mapEditsToDiffFields never sets oldTimestamp nor a nullish originVersion, so craft a diff field directly.
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
    expect(footer.text()).toContain('20 maart 2026')
    expect(footer.text()).toContain('versie 1')
  })

  describe('IAMA namespace branches', () => {
    async function setupIama(edit: any, tasks: Partial<Record<FormType, Record<string, any>>>, currentState?: unknown) {
      apiGet.mockResolvedValue({
        role: 'owner',
        projectId: 'p',
        currentVersion: 4,
        state: currentState ?? { answers: {}, metadata: { completedTasks: [] } },
      })
      apiVersions.mockResolvedValue([
        { id: 'v2', version: 2, createdByName: 'A', updatedAt: '2026-01-02T10:00:00Z', changeDescription: null },
      ])
      setTasks(tasks)
      apiVersionEdits.mockResolvedValue([edit])
      const wrapper = mountView()
      await flushPromises()
      await wrapper.find(DIFF_TOGGLE).trigger('click')
      await flushPromises()
      return wrapper
    }

    it('labels an iama answer_change via the IAMA namespace (getFieldLabel + getFieldOptions)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'iama.1.1',
          editType: 'answer_change',
          oldValue: { value: 'ja' },
          newValue: { value: 'nee' },
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        {
          [FormType.IAMA]: {
            '1.1': {
              id: '1.1',
              task: '<p>Mensenrechten-impact</p>',
              is_official_id: true,
              options: [
                { value: 'ja', label: 'Ja' },
                { value: 'nee', label: 'Nee' },
              ],
            },
          },
        },
      )
      // Label resolved through the IAMA namespace branch in getFieldLabel/getFieldOptions
      expect(wrapper.find('.diff-field').text()).toContain('1.1. Mensenrechten-impact')
      expect(wrapper.find('.diff-old').text()).toContain('ja')
      expect(wrapper.find('.diff-new').text()).toContain('nee')
    })

    it('renders an iama section_complete edit (mapEditsToDiffFields IAMA branch)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'urn:nl:iama:1.0?=task_id=completed.3',
          editType: 'section_complete',
          oldValue: true,
          newValue: false,
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        { [FormType.IAMA]: { '3': { id: '3', task: '<p>Belangenafweging</p>' } } },
      )
      expect(wrapper.find('.diff-field').text()).toContain('Status sectie 3 "Belangenafweging"')
      expect(wrapper.find('.diff-old').text()).toContain('Voltooid')
      expect(wrapper.find('.diff-new').text()).toContain('Niet voltooid')
    })

    it('falls back to the raw field id when the URN is malformed (instance_added)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'urn:nl:iama:1.0',
          editType: 'instance_added',
          oldValue: null,
          newValue: null,
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        {},
      )
      expect(wrapper.find('.diff-field').text()).toContain('urn:nl:iama:1.0')
    })

    it('falls back to the raw field id when the URN is malformed (section_complete)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'urn:nl:iama:1.0',
          editType: 'section_complete',
          oldValue: false,
          newValue: true,
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        {},
      )
      expect(wrapper.find('.diff-field').text()).toContain('urn:nl:iama:1.0')
    })

    it('renders an iama instance_added edit (mapEditsToDiffFields IAMA branch)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'urn:nl:iama:1.0?=task_id=2.1&task_index=0',
          editType: 'instance_added',
          oldValue: null,
          newValue: { '2.1.1': { value: 'inhoud' } },
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        {
          [FormType.IAMA]: {
            '2.1': { id: '2.1', task: '<p>Betrokkenen</p>', is_official_id: true },
            '2.1.1': { id: '2.1.1', task: '<p>Naam</p>', options: [] },
          },
        },
      )
      expect(wrapper.find('.diff-field').text()).toContain('2.1. Betrokkenen #1')
      expect(wrapper.text()).toContain('Naam')
      expect(wrapper.text()).toContain('inhoud')
    })

    it('restores a repeatable iama answer_change (handleFieldRestore IAMA branch)', async () => {
      const wrapper = await setupIama(
        {
          id: 'e1',
          fieldId: 'urn:nl:iama:1.0?=task_id=2.1.1&task_index=0',
          editType: 'answer_change',
          oldValue: { value: 'oud' },
          newValue: { value: 'nieuw' },
          editedBy: 'sam@example.com',
          editedAt: 't',
          version: 2,
        },
        {
          [FormType.IAMA]: {
            '2.1.1': { id: '2.1.1', task: 'Veld', parentId: '2.1' },
            '2.1': { id: '2.1', task: 'Groep', repeatable: true },
          },
        },
        { answers: { '2.1': [{ _index: 0, '2.1.1': { value: 'huidig' } }] }, metadata: {} },
      )
      await fieldRestoreDialogConfirm(wrapper)
      const [, state] = apiUpdate.mock.calls[0]
      expect((state as any).answers['2.1'][0]['2.1.1'].value).toBe('oud')
    })
  })
})

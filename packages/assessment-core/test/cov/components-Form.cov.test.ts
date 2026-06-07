import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const exportToJsonMock = vi.fn()
const exportToPdfMock = vi.fn<() => Promise<void>>()
vi.mock('../../src/utils/jsonExport', () => ({
  exportToJson: (...args: unknown[]) => exportToJsonMock(...args),
}))
vi.mock('../../src/utils/pdfExport', () => ({
  exportToPdf: (...args: unknown[]) => exportToPdfMock(...args),
}))

const exportToMarkdownMock = vi.fn<() => Promise<void>>()
vi.mock('../../src/utils/markdownExport', () => ({
  exportToMarkdown: (...args: unknown[]) => exportToMarkdownMock(...args),
}))

const rebuildMock = vi.fn()
vi.mock('../../src/utils/applyState', () => ({
  rebuildRepeatableInstances: (...args: unknown[]) => rebuildMock(...args),
}))

import Form from '../../src/components/Form.vue'
import { PERSISTENCE_KEY, type PersistenceProvider } from '../../src/persistence'
import { FormType, type DPIA } from '../../src/models/dpia'
import type { AssessmentState } from '../../src/models/assessmentState'
import type { NavigationFunctions } from '../../src/models/navigation'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import * as t from 'io-ts'

type ValidData = t.TypeOf<typeof DPIA>

function makeValidData(): ValidData {
  return {
    name: 'DPIA',
    urn: 'urn:nl:dpia:3.0',
    version: '1.0',
    description: 'Data Protection Impact Assessment',
    tasks: [
      { id: '0', task: 'Inleiding', type: ['task_group'], tasks: [] },
      { id: '1', task: 'Ondertekening', type: ['signing'], tasks: [] },
    ],
  } as unknown as ValidData
}

function makeNavigation(): NavigationFunctions {
  return {
    goToLanding: vi.fn(),
    goToDPIA: vi.fn(),
    goToPreScanDPIA: vi.fn(),
  }
}

interface PersistenceOptions {
  savedState?: AssessmentState | null
  includeRestoreUiState?: boolean
  includeSnapshotBaseline?: boolean
  includeFlushSave?: boolean
  teardown?: (() => void) | undefined
  loadAppStateImpl?: () => AssessmentState | null | Promise<AssessmentState | null>
}

function makePersistence(opts: PersistenceOptions = {}) {
  const {
    savedState = null,
    includeRestoreUiState = true,
    includeSnapshotBaseline = true,
    includeFlushSave = true,
    teardown = undefined,
    loadAppStateImpl,
  } = opts

  const provider = {
    saveAppState: vi.fn(),
    loadAppState: vi.fn(loadAppStateImpl ?? (async () => savedState)),
    applyAppState: vi.fn(),
    clearSavedState: vi.fn(),
    setupWatchers: vi.fn(() => teardown),
  } as unknown as PersistenceProvider & Record<string, ReturnType<typeof vi.fn>>

  if (includeRestoreUiState) provider.restoreUiState = vi.fn()
  if (includeSnapshotBaseline) provider.snapshotBaseline = vi.fn()
  if (includeFlushSave) provider.flushSave = vi.fn()

  return provider as PersistenceProvider & Record<string, ReturnType<typeof vi.fn>>
}

const stubs = {
  Banner: { name: 'Banner', template: '<div class="stub-banner" />' },
  ProgressTracker: {
    name: 'ProgressTracker',
    props: ['disabled', 'navigable'],
    template: '<div class="stub-progress" :data-disabled="disabled" :data-navigable="navigable" />',
  },
  ExportMenu: {
    name: 'ExportMenu',
    emits: ['export'],
    template:
      '<div class="stub-exportmenu"><button class="em-pdf" @click="$emit(\'export\', \'pdf\')">Exporteer als PDF</button><button class="em-json" @click="$emit(\'export\', \'json\')">Exporteer als JSON</button><button class="em-markdown" @click="$emit(\'export\', \'markdown\')">Exporteer als Markdown</button></div>',
  },
  TaskSection: {
    name: 'TaskSection',
    props: ['taskId'],
    template: '<div class="stub-tasksection" :data-task-id="taskId" />',
  },
  NavHeader: {
    name: 'NavHeader',
    props: ['navigation'],
    // Render the default slot so the file-action buttons (reset + ExportMenu)
    // that Form places in the NavHeader slot are visible to assertions.
    template: '<div class="stub-navheader"><slot /></div>',
  },
  FileUploadPage: {
    name: 'FileUploadPage',
    emits: ['start'],
    template: '<div class="stub-fileupload"><button class="fu-start" @click="$emit(\'start\')" /></div>',
  },
  LiveResults: { name: 'LiveResults', template: '<div class="stub-liveresults" />' },
  UiButton: {
    name: 'UiButton',
    props: ['variant', 'label', 'icon', 'size', 'showIconAfter'],
    emits: ['click'],
    template:
      '<button class="stub-uibutton" :data-label="label" :data-variant="variant" @click="$emit(\'click\', $event)">{{ label }}</button>',
  },
}

interface MountOptions {
  namespace?: FormType
  validData?: ValidData | null
  showBanner?: boolean
  showNavHeader?: boolean
  showFileActions?: boolean
  autoStart?: boolean
  persistence?: PersistenceProvider
}

async function mountForm(opts: MountOptions = {}) {
  const persistence = opts.persistence ?? makePersistence()
  const navigation = makeNavigation()
  const wrapper = mount(Form, {
    props: {
      navigation,
      namespace: opts.namespace ?? FormType.DPIA,
      validData: opts.validData === undefined ? makeValidData() : opts.validData,
      ...(opts.showBanner !== undefined ? { showBanner: opts.showBanner } : {}),
      ...(opts.showNavHeader !== undefined ? { showNavHeader: opts.showNavHeader } : {}),
      ...(opts.showFileActions !== undefined ? { showFileActions: opts.showFileActions } : {}),
      ...(opts.autoStart !== undefined ? { autoStart: opts.autoStart } : {}),
    },
    global: {
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
      stubs,
    },
  })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return { wrapper, persistence, navigation }
}

function uiButtonByLabel(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.findAll('.stub-uibutton').find((b) => b.attributes('data-label') === label)
}

beforeEach(() => {
  setActivePinia(createPinia())
  exportToJsonMock.mockReset()
  exportToPdfMock.mockReset().mockResolvedValue(undefined)
  exportToMarkdownMock.mockReset().mockResolvedValue(undefined)
  rebuildMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Form.vue onMounted initialization', () => {
  it('renders the loading state before mount resolves, then the form', async () => {
    let resolveLoad: (v: AssessmentState | null) => void = () => {}
    const persistence = makePersistence({
      loadAppStateImpl: () =>
        new Promise<AssessmentState | null>((res) => {
          resolveLoad = res
        }),
    })

    const wrapper = mount(Form, {
      props: { navigation: makeNavigation(), namespace: FormType.DPIA, validData: makeValidData() },
      global: { provide: { [PERSISTENCE_KEY as symbol]: persistence }, stubs },
    })

    expect(wrapper.text()).toContain('Ophalen van taken...')

    resolveLoad(null)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('Ophalen van taken...')
    expect(wrapper.find('.stub-progress').exists()).toBe(true)
  })

  it('sets an error message and stops loading when validData is null', async () => {
    const { wrapper, persistence } = await mountForm({ validData: null })

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Foutmelding')
    expect(wrapper.text()).toContain('Er is iets mis gegaan bij het inlezen van de vragen.')
    expect(wrapper.find('pre').text()).toContain('Geen geldige schemadata beschikbaar voor dpia')
    expect(persistence.loadAppState).not.toHaveBeenCalled()
  })

  it('applies saved state, rebuilds instances and calls optional hooks when present', async () => {
    const savedState: AssessmentState = {
      metadata: { createdAt: '2026-03-20T12:00:00Z' },
      answers: { '0.1': { value: 'Inleiding' } },
    }
    const { persistence } = await mountForm({ persistence: makePersistence({ savedState }) })

    expect(persistence.applyAppState).toHaveBeenCalledWith(savedState)
    expect(rebuildMock).toHaveBeenCalledTimes(1)
    expect(persistence.restoreUiState).toHaveBeenCalledTimes(1)
    expect(persistence.snapshotBaseline).toHaveBeenCalledTimes(1)
    expect(persistence.setupWatchers).toHaveBeenCalledTimes(1)
  })

  it('skips saved-state handling when no saved state is returned', async () => {
    const { persistence } = await mountForm({ persistence: makePersistence({ savedState: null }) })

    expect(persistence.applyAppState).not.toHaveBeenCalled()
    expect(rebuildMock).not.toHaveBeenCalled()
  })

  it('works when optional persistence hooks (restoreUiState / snapshotBaseline) are absent', async () => {
    const persistence = makePersistence({
      includeRestoreUiState: false,
      includeSnapshotBaseline: false,
    })
    const { wrapper } = await mountForm({ persistence })

    expect(wrapper.find('.stub-progress').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('takes the truthy teardown branch when setupWatchers returns a function', async () => {
    const teardown = vi.fn()
    const persistence = makePersistence({ teardown })
    const { wrapper } = await mountForm({ persistence })

    expect(persistence.setupWatchers).toHaveBeenCalledTimes(1)
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('does not register teardown when setupWatchers returns undefined', async () => {
    const persistence = makePersistence({ teardown: undefined })
    const { wrapper } = await mountForm({ persistence })
    expect(() => wrapper.unmount()).not.toThrow()
  })
})

describe('Form.vue onMounted error handling', () => {
  it('captures an Error message thrown during initialization', async () => {
    const persistence = makePersistence({
      loadAppStateImpl: () => {
        throw new Error('boom')
      },
    })
    const { wrapper } = await mountForm({ persistence })

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('pre').text()).toContain('boom')
  })

  it('falls back to a generic Dutch message for non-Error throws', async () => {
    const persistence = makePersistence({
      loadAppStateImpl: () => {
        throw 'not-an-error'
      },
    })
    const { wrapper } = await mountForm({ persistence })

    expect(wrapper.find('pre').text()).toContain('Er is een onbekende fout opgetreden')
  })
})

describe('Form.vue autoStart', () => {
  it('auto-starts the form (skips FileUploadPage) when autoStart is true', async () => {
    const { wrapper } = await mountForm({ autoStart: true })

    expect(wrapper.find('.stub-fileupload').exists()).toBe(false)
    expect(wrapper.find('.stub-tasksection').exists()).toBe(true)
  })

  it('shows FileUploadPage and not the task section when autoStart is false', async () => {
    const { wrapper } = await mountForm({ autoStart: false })

    expect(wrapper.find('.stub-fileupload').exists()).toBe(true)
    expect(wrapper.find('.stub-tasksection').exists()).toBe(false)
  })
})

describe('Form.vue prop-driven template branches', () => {
  it('renders the Banner when showBanner is true (default)', async () => {
    const { wrapper } = await mountForm({})
    expect(wrapper.find('.stub-banner').exists()).toBe(true)
  })

  it('hides the Banner when showBanner is false', async () => {
    const { wrapper } = await mountForm({ showBanner: false })
    expect(wrapper.find('.stub-banner').exists()).toBe(false)
  })

  it('renders NavHeader when showNavHeader is true (default)', async () => {
    const { wrapper } = await mountForm({})
    expect(wrapper.find('.stub-navheader').exists()).toBe(true)
  })

  it('hides NavHeader when showNavHeader is false', async () => {
    const { wrapper } = await mountForm({ showNavHeader: false })
    expect(wrapper.find('.stub-navheader').exists()).toBe(false)
  })

  it('marks ProgressTracker navigable for DPIA', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.DPIA })
    expect(wrapper.find('.stub-progress').attributes('data-navigable')).toBe('true')
  })

  it('marks ProgressTracker navigable for PRE_SCAN', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.PRE_SCAN })
    expect(wrapper.find('.stub-progress').attributes('data-navigable')).toBe('true')
  })

  it('shows the file-action buttons only when started and showFileActions is true', async () => {
    // File actions moved into the NavHeader slot: the reset UiButton + ExportMenu.
    const { wrapper } = await mountForm({ autoStart: true, showFileActions: true })
    expect(uiButtonByLabel(wrapper, 'Begin nieuwe DPIA')).toBeTruthy()
    expect(wrapper.findAll('.stub-exportmenu').length).toBeGreaterThan(0)
  })

  it('hides the file-action buttons when showFileActions is false', async () => {
    const { wrapper } = await mountForm({ autoStart: true, showFileActions: false })
    expect(uiButtonByLabel(wrapper, 'Begin nieuwe DPIA')).toBeFalsy()
  })

  it('labels the reset button "Begin nieuwe DPIA" for the DPIA namespace', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.DPIA, autoStart: true })
    expect(uiButtonByLabel(wrapper, 'Begin nieuwe DPIA')).toBeTruthy()
  })

  it('labels the reset button "Begin nieuwe Pre-scan" for the PRE_SCAN namespace', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.PRE_SCAN, autoStart: true })
    expect(uiButtonByLabel(wrapper, 'Begin nieuwe Pre-scan')).toBeTruthy()
  })

  it('labels the reset button "Begin nieuwe IAMA" for the IAMA namespace', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.IAMA, autoStart: true })
    expect(uiButtonByLabel(wrapper, 'Begin nieuwe IAMA')).toBeTruthy()
  })
})

describe('Form.vue navigation buttons', () => {
  it('on the first (non-last) section: shows "Volgende stap" and the completed checkbox, hides "Vorige stap"', async () => {
    const { wrapper } = await mountForm({ autoStart: true })
    expect(uiButtonByLabel(wrapper, 'Vorige stap')).toBeFalsy()
    expect(uiButtonByLabel(wrapper, 'Volgende stap')).toBeTruthy()
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    // No last-section ExportMenu in the content area on a non-last section.
    expect(wrapper.find('.rvo-layout-margin-vertical--xl .stub-exportmenu').exists()).toBe(false)
  })

  it('goToNext flushes saves and advances; the last section shows "Vorige stap" + the content ExportMenu', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: true })
    const taskStore = useTaskStore()

    await uiButtonByLabel(wrapper, 'Volgende stap')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(persistence.flushSave).toHaveBeenCalled()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('1')

    expect(uiButtonByLabel(wrapper, 'Vorige stap')).toBeTruthy()
    // The last section renders the shared ExportMenu (with a real PDF export button).
    expect(wrapper.findAll('.em-pdf').length).toBeGreaterThan(0)
    expect(uiButtonByLabel(wrapper, 'Volgende stap')).toBeFalsy()
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })

  it('goToPrevious flushes saves and goes back a section', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: true })
    const taskStore = useTaskStore()

    await uiButtonByLabel(wrapper, 'Volgende stap')!.trigger('click')
    await wrapper.vm.$nextTick()
    ;(persistence.flushSave as ReturnType<typeof vi.fn>).mockClear()

    await uiButtonByLabel(wrapper, 'Vorige stap')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(persistence.flushSave).toHaveBeenCalled()
    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('flushBeforeNavigate is a no-op when persistence.flushSave is absent', async () => {
    const persistence = makePersistence({ includeFlushSave: false })
    const { wrapper } = await mountForm({ autoStart: true, persistence })
    const taskStore = useTaskStore()

    await uiButtonByLabel(wrapper, 'Volgende stap')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('1')
  })

  it('toggling the completed checkbox calls toggleCompleteForTaskId and flushes', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: true })
    const taskStore = useTaskStore()
    ;(persistence.flushSave as ReturnType<typeof vi.fn>).mockClear()

    const checkbox = wrapper.find('input[type="checkbox"]')
    await checkbox.trigger('change')

    expect(taskStore.isRootTaskCompleted('0')).toBe(true)
    expect(persistence.flushSave).toHaveBeenCalled()
  })
})

describe('Form.vue export handlers', () => {
  it('handleExport(pdf) calls exportToPdf from the last-section ExportMenu', async () => {
    const { wrapper } = await mountForm({ autoStart: true })

    await uiButtonByLabel(wrapper, 'Volgende stap')!.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.em-pdf')[0].trigger('click')
    await flushPromises()

    expect(exportToPdfMock).toHaveBeenCalledTimes(1)
  })

  it('handleExport logs an error when exportToPdf rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    exportToPdfMock.mockRejectedValueOnce(new Error('pdf failed'))

    const { wrapper } = await mountForm({ autoStart: true })
    await uiButtonByLabel(wrapper, 'Volgende stap')!.trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.em-pdf')[0].trigger('click')
    await flushPromises()

    expect(consoleSpy).toHaveBeenCalledWith('Failed to export pdf:', expect.any(Error))
  })

  it('exports to JSON via the ExportMenu (replaces the removed SaveForm modal)', async () => {
    const { wrapper } = await mountForm({ autoStart: true })

    // The SaveForm modal was removed; JSON export now flows through ExportMenu.
    await wrapper.findAll('.em-json')[0].trigger('click')
    await flushPromises()

    expect(exportToJsonMock).toHaveBeenCalledTimes(1)
    expect(exportToJsonMock).toHaveBeenCalledWith(expect.anything(), expect.anything())
  })

  it('exports to Markdown via the ExportMenu (handleExport markdown branch)', async () => {
    const { wrapper } = await mountForm({ autoStart: true })

    await wrapper.findAll('.em-markdown')[0].trigger('click')
    await flushPromises()

    expect(exportToMarkdownMock).toHaveBeenCalledTimes(1)
    expect(exportToMarkdownMock).toHaveBeenCalledWith(expect.anything(), expect.anything())
  })
})

describe('Form.vue handleStart (FileUploadPage)', () => {
  it('starts without file data: just sets formStarted, no apply/rebuild', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: false })

    await wrapper.find('.fu-start').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.stub-tasksection').exists()).toBe(true)
    expect(persistence.applyAppState).not.toHaveBeenCalled()
    expect(rebuildMock).not.toHaveBeenCalled()
  })

  it('starts with file data: applies state, rebuilds instances and syncs', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: false })
    const fileData: AssessmentState = {
      metadata: { createdAt: '2026-03-20T12:00:00Z' },
      answers: { '0.1': { value: 'Inleiding' } },
    }

    const fileUpload = wrapper.findComponent({ name: 'FileUploadPage' })
    fileUpload.vm.$emit('start', fileData)
    await wrapper.vm.$nextTick()

    expect(persistence.applyAppState).toHaveBeenCalledWith(fileData)
    expect(rebuildMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), fileData.answers)
    expect(wrapper.find('.stub-tasksection').exists()).toBe(true)
  })
})

describe('Form.vue handleReset', () => {
  it('clears state, resets stores and returns to the FileUploadPage', async () => {
    const { wrapper, persistence } = await mountForm({ autoStart: true })
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    answerStore.answers[FormType.DPIA] = { '0.1': { value: 'Inleiding' } }
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['0'])

    await uiButtonByLabel(wrapper, 'Begin nieuwe DPIA')!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(persistence.clearSavedState).toHaveBeenCalledWith(FormType.DPIA)
    expect(answerStore.answers[FormType.DPIA]).toEqual({})
    expect(taskStore.completedRootTaskIds[FormType.DPIA]).toEqual(new Set())
    expect(wrapper.find('.stub-fileupload').exists()).toBe(true)
    expect(wrapper.find('.stub-tasksection').exists()).toBe(false)
  })

  it('uses the rootTaskIds fallback "0" and skips re-init when validData is null', async () => {
    const { wrapper } = await mountForm({ validData: null })
    const taskStore = useTaskStore()
    taskStore.rootTaskIds[FormType.DPIA] = []
    const initSpy = vi.spyOn(taskStore, 'init')

    ;(wrapper.vm as unknown as { handleReset: () => void }).handleReset()
    await wrapper.vm.$nextTick()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('uses the first rootTaskId when one exists', async () => {
    const { wrapper } = await mountForm({ autoStart: true })
    const taskStore = useTaskStore()
    expect(taskStore.rootTaskIds[FormType.DPIA][0]).toBe('0')

    ;(wrapper.vm as unknown as { handleReset: () => void }).handleReset()
    await wrapper.vm.$nextTick()

    expect(taskStore.currentRootTaskId[FormType.DPIA]).toBe('0')
  })
})

describe('Form.vue LiveResults (PRE_SCAN)', () => {
  it('renders LiveResults when prescan, started and not on a signing task', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.PRE_SCAN, autoStart: true })
    expect(wrapper.find('.stub-liveresults').exists()).toBe(true)
  })

  it('hides LiveResults on a signing section', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.PRE_SCAN, autoStart: true })
    const taskStore = useTaskStore()
    taskStore.setRootTask('1')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.stub-liveresults').exists()).toBe(false)
  })

  it('hides LiveResults for the DPIA namespace', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.DPIA, autoStart: true })
    expect(wrapper.find('.stub-liveresults').exists()).toBe(false)
  })
})

describe('Form.vue answers watcher and unmount', () => {
  it('syncs instances when answers change (deep watcher)', async () => {
    const { wrapper } = await mountForm({ autoStart: true })
    const answerStore = useAnswerStore()

    answerStore.answers[FormType.DPIA]['0.1'] = { value: 'Inleiding' }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.stub-tasksection').exists()).toBe(true)
  })

  it('flushes pending saves on unmount when flushSave is present', async () => {
    const persistence = makePersistence({ includeFlushSave: true })
    const { wrapper } = await mountForm({ autoStart: true, persistence })
    ;(persistence.flushSave as ReturnType<typeof vi.fn>).mockClear()

    wrapper.unmount()
    expect(persistence.flushSave).toHaveBeenCalledTimes(1)
  })

  it('unmount does not throw when flushSave is absent', async () => {
    const persistence = makePersistence({ includeFlushSave: false })
    const { wrapper } = await mountForm({ autoStart: true, persistence })

    expect(() => wrapper.unmount()).not.toThrow()
  })
})

describe('Form.vue isSigningTask computed', () => {
  it('is false for a task_group section and true for a signing section', async () => {
    const { wrapper } = await mountForm({ namespace: FormType.PRE_SCAN, autoStart: true })
    const taskStore = useTaskStore()

    expect(wrapper.find('.stub-liveresults').exists()).toBe(true)

    taskStore.setRootTask('1')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.stub-liveresults').exists()).toBe(false)
  })
})

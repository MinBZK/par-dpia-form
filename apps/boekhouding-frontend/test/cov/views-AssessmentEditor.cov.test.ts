/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const {
  FormTypeMock,
  schemaStore,
  taskStore,
  answerStore,
  calculationStore,
  exportToJson,
  exportToMarkdown,
  exportToPdf,
  assessmentsApi,
  conflictState,
  sync,
  persistenceResolve,
  createApiPersistence,
  collaborationStore,
  useFieldCommentIndicators,
  fieldClickHolder,
} = vi.hoisted(() => {
  const { reactive, ref } = require('vue')
  const FormTypeMock = { DPIA: 'dpia', PRE_SCAN: 'prescan', IAMA: 'iama' } as const

  const schemaStore = reactive({
    isInitialized: false,
    init: vi.fn(),
    getSchema: vi.fn(),
  })
  const taskStore: any = reactive({
    activeNamespace: FormTypeMock.DPIA,
    currentRootTaskId: { dpia: '0', prescan: '0' } as Record<string, string>,
    isInitialized: { dpia: false, prescan: false } as Record<string, boolean>,
    reset: vi.fn(),
    setActiveNamespace: vi.fn((ns: string) => { taskStore.activeNamespace = ns }),
    init: vi.fn(),
  })
  const answerStore: any = reactive({
    answers: {} as Record<string, unknown>,
    reset: vi.fn(),
    setActiveNamespace: vi.fn(),
  })
  const calculationStore = reactive({ reset: vi.fn() })

  const exportToJson = vi.fn().mockResolvedValue(undefined)
  const exportToMarkdown = vi.fn().mockResolvedValue(undefined)
  const exportToPdf = vi.fn().mockResolvedValue(undefined)

  const assessmentsApi = {
    get: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  }

  const conflictState: any = reactive({ active: false, fields: [] as unknown[] })
  const sync = {
    knownVersion: ref<number | undefined>(undefined),
    knownUpdatedAt: ref<string | undefined>(undefined),
    handleRemoteChange: vi.fn(),
    applyDeferredChanges: vi.fn(),
    applyDeferredOnNavigate: vi.fn(),
    hasDeferredChanges: vi.fn(),
  }
  const persistenceResolve = vi.fn()
  conflictState.resolve = persistenceResolve
  const createApiPersistence = vi.fn(() => ({
    conflictState,
    sync,
    saveAppState: vi.fn(),
    loadAppState: vi.fn(),
    applyAppState: vi.fn(),
    clearSavedState: vi.fn(),
    setupWatchers: vi.fn(),
    flushSave: vi.fn(),
    restoreUiState: vi.fn(),
    snapshotBaseline: vi.fn(),
  }))

  const collaborationStore: any = reactive({
    assessmentVersion: null as number | null,
    assessmentUpdatedAt: null as string | null,
    lastModifiedBySelf: true,
    load: vi.fn().mockResolvedValue(undefined),
    startPolling: vi.fn(),
    reset: vi.fn(),
  })

  const fieldClickHolder: {
    fn: ((fieldId: string) => void) | null
    canComment: { value: boolean } | null
  } = { fn: null, canComment: null }
  const useFieldCommentIndicators = vi.fn((
    _ref: unknown,
    onFieldClick: (id: string) => void,
    canComment: { value: boolean },
  ) => {
    fieldClickHolder.fn = onFieldClick
    fieldClickHolder.canComment = canComment
  })

  return {
    FormTypeMock,
    schemaStore,
    taskStore,
    answerStore,
    calculationStore,
    exportToJson,
    exportToMarkdown,
    exportToPdf,
    assessmentsApi,
    conflictState,
    sync,
    persistenceResolve,
    createApiPersistence,
    collaborationStore,
    useFieldCommentIndicators,
    fieldClickHolder,
  }
})

vi.mock('@overheid-assessment/core', () => ({
  Form: {
    name: 'Form',
    props: ['navigation', 'namespace', 'validData', 'showBanner', 'showNavHeader', 'showFileActions', 'autoStart'],
    template: '<div class="form-stub" :data-namespace="namespace" />',
  },
  FormType: FormTypeMock,
  useSchemaStore: () => schemaStore,
  useTaskStore: () => taskStore,
  useAnswerStore: () => answerStore,
  useCalculationStore: () => calculationStore,
  exportToJson,
  exportToMarkdown,
  exportToPdf,
  PERSISTENCE_KEY: Symbol('persistence'),
}))

vi.mock('../../src/api', () => ({
  assessments: assessmentsApi,
}))

vi.mock('../../src/ApiPersistence', () => ({
  createApiPersistence,
}))

vi.mock('../../src/stores/collaboration', () => ({
  useCollaborationStore: () => collaborationStore,
}))

vi.mock('../../src/composables/useFieldCommentIndicators', () => ({
  useFieldCommentIndicators,
}))

// Mock the dynamically-imported schemas so the import resolves deterministically; the real JSON resolves out-of-band and leaks schemaStore.init() calls across tests.
vi.mock('../../../../sources/generated/DPIA.json', () => ({
  default: { name: 'DPIA', urn: 'urn:nl:dpia', version: '3.0', tasks: [{ id: '0' }] },
}))
vi.mock('../../../../sources/generated/PreScanDPIA.json', () => ({
  default: { name: 'PreScanDPIA', urn: 'urn:nl:prescan', version: '1.0', tasks: [{ id: '0' }] },
}))

import AssessmentEditor from '../../src/views/AssessmentEditor.vue'

// jsdom lacks the native <dialog> API; stand-ins let the deleteModalOpen watcher (showModal/close) run.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () { this.open = false }
}

const stubs = {
  AppHeader: { name: 'AppHeader', props: ['backLabel', 'backRoute'], template: '<header class="app-header-stub" />' },
  ConflictResolutionDialog: {
    name: 'ConflictResolutionDialog',
    props: ['active', 'fields'],
    emits: ['resolve'],
    template: '<div class="conflict-stub" :data-active="active" @click="$emit(\'resolve\', new Map())" />',
  },
  CommentBadge: {
    name: 'CommentBadge',
    props: ['open'],
    emits: ['toggle'],
    template: '<button class="comment-badge-stub" @click="$emit(\'toggle\')" />',
  },
  CommentPanel: {
    name: 'CommentPanel',
    props: ['role', 'activeFieldId', 'formContainerRef'],
    emits: ['close', 'deactivate-field'],
    template: '<aside class="comment-panel-stub" :data-role="role" :data-field="activeFieldId" />',
  },
}

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    projectId: 'p1',
    assessmentType: 'dpia',
    name: 'Mijn assessment',
    currentVersion: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    role: 'owner',
    ...overrides,
  }
}

async function mountEditor(props: { assessmentId?: string } = {}) {
  const wrapper = mount(AssessmentEditor, {
    props: { assessmentId: props.assessmentId ?? 'a1' },
    global: { stubs },
  })
  // Wait deterministically until loading clears: a fixed cycle count is flaky because the dynamic schema import can resolve late and leak init() into the next test.
  await vi.waitFor(
    () => {
      if (wrapper.text().includes('Assessment laden...')) {
        throw new Error('still loading')
      }
    },
    { timeout: 5000, interval: 10 },
  )
  await flushPromises()
  await nextTick()
  return wrapper
}

beforeEach(async () => {
  // Drain any pending async onMounted (dynamic schema imports -> schemaStore.init)
  // from a prior test before resetting mocks, so a late init call can't leak into
  // this test and inflate the call count. The real dynamic schema imports settle on
  // a macrotask tick that flushPromises (microtasks only) can't drain, so await the
  // same module singletons first — under load this is what a prior test's late
  // init() is waiting on.
  await Promise.all([
    import('../../../../sources/generated/PreScanDPIA.json'),
    import('../../../../sources/generated/DPIA.json'),
    import('../../../../sources/generated/IAMA.json'),
  ]).catch(() => {})
  await flushPromises()
  vi.clearAllMocks()
  routerPush.mockReset()
  fieldClickHolder.fn = null

  schemaStore.isInitialized = false
  schemaStore.getSchema.mockReset()
  taskStore.activeNamespace = FormTypeMock.DPIA
  taskStore.currentRootTaskId = { dpia: '0', prescan: '0' }
  taskStore.isInitialized = { dpia: false, prescan: false }
  answerStore.answers = {}
  conflictState.active = false
  conflictState.fields = []
  conflictState.resolve = persistenceResolve
  sync.knownVersion.value = undefined
  sync.knownUpdatedAt.value = undefined
  sync.handleRemoteChange.mockReset()
  sync.applyDeferredChanges.mockReset()
  sync.applyDeferredOnNavigate.mockReset()
  sync.hasDeferredChanges.mockReset()
  collaborationStore.assessmentVersion = null
  collaborationStore.assessmentUpdatedAt = null
  collaborationStore.lastModifiedBySelf = true
  collaborationStore.load.mockResolvedValue(undefined)

  assessmentsApi.get.mockResolvedValue(makeAssessment())
  assessmentsApi.rename.mockResolvedValue(makeAssessment({ name: 'DPIA: Nieuw' }))
  assessmentsApi.delete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AssessmentEditor — loading and error states', () => {
  it('shows the loading message before the assessment resolves', async () => {
    let resolveGet!: (v: unknown) => void
    assessmentsApi.get.mockReturnValueOnce(new Promise((r) => { resolveGet = r }))
    const wrapper = mount(AssessmentEditor, {
      props: { assessmentId: 'a1' },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Assessment laden...')
    resolveGet(makeAssessment())
    await flushPromises()
    wrapper.unmount()
  })

  it('renders the error alert and navigates back to the project when get() rejects', async () => {
    assessmentsApi.get.mockRejectedValueOnce(new Error('Kapot'))
    const wrapper = await mountEditor()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Foutmelding')
    expect(wrapper.text()).toContain('Kapot')

    await wrapper.find('[role="alert"] button').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/projecten')
    wrapper.unmount()
  })

  it('error back button navigates to the project when assessment is set', async () => {
    schemaStore.isInitialized = true
    collaborationStore.load.mockRejectedValueOnce(new Error('Sync stuk'))
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Sync stuk')
    await wrapper.find('[role="alert"] button').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/project/p1')
    wrapper.unmount()
  })
})

describe('AssessmentEditor — onMounted initialization', () => {
  it('initializes the schema store when not yet initialized', async () => {
    schemaStore.isInitialized = false
    const wrapper = await mountEditor()
    expect(schemaStore.init).toHaveBeenCalledTimes(1)
    expect(taskStore.reset).toHaveBeenCalled()
    expect(answerStore.reset).toHaveBeenCalled()
    expect(calculationStore.reset).toHaveBeenCalled()
    expect(collaborationStore.startPolling).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('skips schema init when already initialized', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(schemaStore.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('initializes the pre-scan task structure from _prescanAnswers (DPIA)', async () => {
    schemaStore.isInitialized = true
    schemaStore.getSchema.mockReturnValue({ tasks: [{ id: 'p' }] })
    taskStore.isInitialized = { dpia: false, prescan: false }
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'dpia',
      state: { _prescanAnswers: { '1.1': { value: 'x' } } },
    }))
    const wrapper = await mountEditor()
    expect(schemaStore.getSchema).toHaveBeenCalledWith(FormTypeMock.PRE_SCAN)
    expect(taskStore.init).toHaveBeenCalledWith([{ id: 'p' }])
    expect(answerStore.answers[FormTypeMock.PRE_SCAN]).toEqual({ '1.1': { value: 'x' } })
    wrapper.unmount()
  })

  it('falls back to answers.prescan when _prescanAnswers is absent', async () => {
    schemaStore.isInitialized = true
    schemaStore.getSchema.mockReturnValue({ tasks: [{ id: 'q' }] })
    taskStore.isInitialized = { dpia: false, prescan: false }
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'dpia',
      state: { answers: { prescan: { '2.1': { value: 'y' } } } },
    }))
    const wrapper = await mountEditor()
    expect(taskStore.init).toHaveBeenCalledWith([{ id: 'q' }])
    expect(answerStore.answers[FormTypeMock.PRE_SCAN]).toEqual({ '2.1': { value: 'y' } })
    wrapper.unmount()
  })

  it('does not init pre-scan when the embedded answers object is empty', async () => {
    schemaStore.isInitialized = true
    schemaStore.getSchema.mockReturnValue({ tasks: [{ id: 'r' }] })
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'dpia',
      state: { _prescanAnswers: {} },
    }))
    const wrapper = await mountEditor()
    expect(taskStore.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not init pre-scan when the pre-scan schema is missing', async () => {
    schemaStore.isInitialized = true
    schemaStore.getSchema.mockReturnValue(undefined)
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'dpia',
      state: { _prescanAnswers: { '1.1': { value: 'x' } } },
    }))
    const wrapper = await mountEditor()
    expect(taskStore.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not init pre-scan when the pre-scan task store is already initialized', async () => {
    schemaStore.isInitialized = true
    schemaStore.getSchema.mockReturnValue({ tasks: [{ id: 's' }] })
    taskStore.isInitialized = { dpia: false, prescan: true }
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'dpia',
      state: { _prescanAnswers: { '1.1': { value: 'x' } } },
    }))
    const wrapper = await mountEditor()
    expect(taskStore.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('skips pre-scan handling entirely for a prescan assessment', async () => {
    schemaStore.isInitialized = true
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({
      assessmentType: 'prescan',
      state: { _prescanAnswers: { '1.1': { value: 'x' } } },
    }))
    const wrapper = await mountEditor()
    expect(taskStore.init).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Pre-scan DPIA')
    wrapper.unmount()
  })

  it('labels an IAMA assessment as "IAMA" and uses the iama namespace', async () => {
    schemaStore.isInitialized = true
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'iama' }))
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('IAMA')
    expect(wrapper.find('.form-stub').attributes('data-namespace')).toBe('iama')
    wrapper.unmount()
  })

  it('defaults an unknown assessment type to DPIA', async () => {
    schemaStore.isInitialized = true
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'onbekend' }))
    const wrapper = await mountEditor()
    expect(wrapper.find('.form-stub').attributes('data-namespace')).toBe('dpia')
    wrapper.unmount()
  })

  it('does not init pre-scan when DPIA has no state', async () => {
    schemaStore.isInitialized = true
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'dpia', state: undefined }))
    const wrapper = await mountEditor()
    expect(taskStore.init).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resets the collaboration store on unmount', async () => {
    const wrapper = await mountEditor()
    wrapper.unmount()
    expect(collaborationStore.reset).toHaveBeenCalled()
  })
})

describe('AssessmentEditor — display name and type label', () => {
  it('prefixes the type label when the name has no prefix', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'dpia', name: 'Project X' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('h1.form-name').text()).toBe('DPIA: Project X')
    wrapper.unmount()
  })

  it('shows the name as-is when it already starts with the label', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'dpia', name: 'DPIA: Bestaand' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('h1.form-name').text()).toBe('DPIA: Bestaand')
    wrapper.unmount()
  })

  it('uses the Pre-scan DPIA label for prescan assessments', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ assessmentType: 'prescan', name: 'Iets' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('h1.form-name').text()).toBe('Pre-scan DPIA: Iets')
    wrapper.unmount()
  })
})

describe('AssessmentEditor — role-based access', () => {
  it('renders the editable heading with button role for an owner', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const h1 = wrapper.find('h1.form-name')
    expect(h1.classes()).toContain('form-name--editable')
    expect(h1.attributes('role')).toBe('button')
    expect(h1.attributes('aria-label')).toBe('Klik om naam te bewerken')
    expect(wrapper.find('.assessment-editor__form').attributes('inert')).toBeUndefined()
    wrapper.unmount()
  })

  it('marks the form readonly and shows the viewer alert for a viewer', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'viewer' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('.assessment-editor__form').classes()).toContain('form-readonly')
    expect(wrapper.text()).toContain('Je hebt alleen leesrechten op deze assessment.')
    const h1 = wrapper.find('h1.form-name')
    expect(h1.classes()).not.toContain('form-name--editable')
    expect(h1.attributes('role')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows the commenter alert for a commenter', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'commenter' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('Je kunt opmerkingen plaatsen maar niet het formulier bewerken.')
    wrapper.unmount()
  })

  it('passes a viewer role default to CommentPanel when role is missing', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: undefined }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('.comment-badge-stub').trigger('click')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').attributes('data-role')).toBe('viewer')
    wrapper.unmount()
  })

  it.each([
    ['commenter', true],
    ['editor', true],
    ['owner', true],
    ['viewer', false],
  ])('canComment is %s → %s', async (role, expected) => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(fieldClickHolder.canComment!.value).toBe(expected)
    wrapper.unmount()
  })
})

describe('AssessmentEditor — comment panel', () => {
  it('toggles the comment panel open and closed via the badge', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('.comment-panel-stub').exists()).toBe(false)

    await wrapper.find('.comment-badge-stub').trigger('click')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.assessment-editor__content').classes()).toContain('assessment-editor__content--panel-open')

    await wrapper.find('.comment-badge-stub').trigger('click')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the panel and sets the active field via the field-click callback', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(fieldClickHolder.fn).toBeTypeOf('function')
    fieldClickHolder.fn!('2.1')
    await nextTick()
    const panel = wrapper.find('.comment-panel-stub')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('data-field')).toBe('2.1')
    wrapper.unmount()
  })

  it('clears the active field when CommentPanel emits deactivate-field', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    fieldClickHolder.fn!('3.3')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').attributes('data-field')).toBe('3.3')
    await wrapper.findComponent({ name: 'CommentPanel' }).vm.$emit('deactivate-field')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').attributes('data-field')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes the panel and clears the field when CommentPanel emits close', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('.comment-badge-stub').trigger('click')
    await nextTick()
    await wrapper.findComponent({ name: 'CommentPanel' }).vm.$emit('close')
    await nextTick()
    expect(wrapper.find('.comment-panel-stub').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('AssessmentEditor — inline name editing', () => {
  it('enters edit mode on owner heading click and focuses the input', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Oud' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    const input = wrapper.find('input.form-name-input')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Oud')
    wrapper.unmount()
  })

  it('uses the full name as the edit value when there is no type prefix', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'Zonder prefix' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('keydown.enter')
    await nextTick()
    expect((wrapper.find('input.form-name-input').element as HTMLInputElement).value).toBe('Zonder prefix')
    wrapper.unmount()
  })

  it('does not enter edit mode for a viewer', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'viewer' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    expect(wrapper.find('input.form-name-input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('cancels editing without saving via Escape', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Oud' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    await wrapper.find('input.form-name-input').trigger('keydown.escape')
    await nextTick()
    expect(wrapper.find('input.form-name-input').exists()).toBe(false)
    expect(assessmentsApi.rename).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels editing via the Annuleer button', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Oud' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Annuleer')!
    await cancelBtn.trigger('click')
    await nextTick()
    expect(wrapper.find('input.form-name-input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('saves a new name with a custom part', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Oud' }))
    assessmentsApi.rename.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Nieuw' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    const input = wrapper.find('input.form-name-input')
    await input.setValue('Nieuw')
    await input.trigger('keydown.enter')
    await flushPromises()
    expect(assessmentsApi.rename).toHaveBeenCalledWith('a1', 'DPIA: Nieuw')
    expect(wrapper.find('h1.form-name').text()).toBe('DPIA: Nieuw')
    wrapper.unmount()
  })

  it('saves the label only when the custom part is blank', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Oud' }))
    assessmentsApi.rename.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    const input = wrapper.find('input.form-name-input')
    await input.setValue('   ')
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!
    await saveBtn.trigger('click')
    await flushPromises()
    expect(assessmentsApi.rename).toHaveBeenCalledWith('a1', 'DPIA')
    wrapper.unmount()
  })

  it('skips the API call and exits edit mode when the name is unchanged', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner', name: 'DPIA: Gelijk' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('h1.form-name').trigger('click')
    await nextTick()
    const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!
    await saveBtn.trigger('click')
    await flushPromises()
    expect(assessmentsApi.rename).not.toHaveBeenCalled()
    expect(wrapper.find('input.form-name-input').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('AssessmentEditor — kebab menu', () => {
  async function openMenu(wrapper: Awaited<ReturnType<typeof mountEditor>>) {
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
  }

  it('opens and closes the menu via the trigger', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
    await openMenu(wrapper)
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(true)
    expect(wrapper.find('.kebab-menu__trigger').attributes('aria-expanded')).toBe('true')
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes the menu on focusout', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await openMenu(wrapper)
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(true)
    await wrapper.find('.kebab-menu').trigger('focusout')
    await nextTick()
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
    wrapper.unmount()
  })

  it('navigates to version history', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await openMenu(wrapper)
    const item = wrapper.findAll('.kebab-menu__item').find((b) => b.text() === 'Versiegeschiedenis')!
    await item.trigger('mousedown')
    expect(routerPush).toHaveBeenCalledWith('/assessment/a1/versies')
    wrapper.unmount()
  })

  it('triggers the PDF, JSON and Markdown exports and closes the menu each time', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()

    await openMenu(wrapper)
    await wrapper.findAll('.kebab-menu__item').find((b) => b.text() === 'Download als PDF')!.trigger('mousedown')
    await flushPromises()
    expect(exportToPdf).toHaveBeenCalledWith(taskStore, answerStore, calculationStore)
    expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)

    await openMenu(wrapper)
    await wrapper.findAll('.kebab-menu__item').find((b) => b.text() === 'Download als JSON')!.trigger('mousedown')
    await flushPromises()
    expect(exportToJson).toHaveBeenCalledWith(taskStore, answerStore)

    await openMenu(wrapper)
    await wrapper.findAll('.kebab-menu__item').find((b) => b.text() === 'Download als Markdown')!.trigger('mousedown')
    await flushPromises()
    expect(exportToMarkdown).toHaveBeenCalledWith(taskStore, answerStore)
    wrapper.unmount()
  })

  it('shows the delete item for an owner', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await openMenu(wrapper)
    expect(wrapper.find('.kebab-menu__item--danger').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the delete item for a non-owner editor', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'editor' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await openMenu(wrapper)
    expect(wrapper.find('.kebab-menu__item--danger').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('AssessmentEditor — delete flow', () => {
  it('opens the delete modal, enables the button on VERWIJDEREN and deletes', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()

    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
    await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
    await nextTick()

    const deleteBtn = wrapper.find('.confirm-dialog__delete')
    expect((deleteBtn.element as HTMLButtonElement).disabled).toBe(true)
    expect(deleteBtn.classes()).toContain('confirm-dialog__delete--disabled')

    const input = wrapper.find('.confirm-dialog__input')
    await input.setValue('VERWIJDEREN')
    await nextTick()
    expect((deleteBtn.element as HTMLButtonElement).disabled).toBe(false)
    expect(deleteBtn.classes()).toContain('rvo-button--primary')

    await deleteBtn.trigger('click')
    await flushPromises()
    expect(assessmentsApi.delete).toHaveBeenCalledWith('a1')
    expect(routerPush).toHaveBeenCalledWith('/project/p1')
    wrapper.unmount()
  })

  it('does nothing on confirmDelete when assessment is null', async () => {
    assessmentsApi.get.mockRejectedValueOnce(new Error('x'))
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { confirmDelete: () => Promise<void> }
    await vm.confirmDelete()
    await flushPromises()
    expect(assessmentsApi.delete).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('closes the delete dialog via the dialog close event', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
    await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
    await nextTick()
    const input = wrapper.find('.confirm-dialog__input')
    await input.setValue('VERWIJDEREN')
    await wrapper.find('dialog.confirm-dialog').trigger('close')
    await nextTick()
    expect((wrapper.find('.confirm-dialog__input').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('cancels the delete dialog via the Annuleer button', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
    await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
    await nextTick()
    const cancelBtn = wrapper.findAll('.confirm-dialog__actions button').find((b) => b.text() === 'Annuleer')!
    await cancelBtn.trigger('click')
    await nextTick()
    expect(assessmentsApi.delete).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('AssessmentEditor — conflict dialog', () => {
  it('forwards conflict state to the dialog and resolves via its event', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    conflictState.active = true
    conflictState.fields = [{ fieldId: '1.1' }]
    await nextTick()
    expect(wrapper.find('.conflict-stub').attributes('data-active')).toBe('true')

    await wrapper.find('.conflict-stub').trigger('click')
    expect(persistenceResolve).toHaveBeenCalledTimes(1)
    expect(persistenceResolve.mock.calls[0][0]).toBeInstanceOf(Map)
    wrapper.unmount()
  })

  it('dismisses the sync toast when the conflict dialog becomes active', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { showSyncToast: (m: string, a?: () => void) => void }
    vm.showSyncToast('Bericht', () => {})
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(true)

    conflictState.active = true
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not dismiss the toast when conflict becomes inactive', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { showSyncToast: (m: string, a?: () => void) => void }
    vm.showSyncToast('Blijf staan', () => {})
    await nextTick()
    conflictState.active = true
    await nextTick()
    vm.showSyncToast('Opnieuw', () => {})
    await nextTick()
    conflictState.active = false
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('AssessmentEditor — sync toast helpers', () => {
  it('auto-dismisses an action-less toast after 3 seconds', async () => {
    vi.useFakeTimers()
    schemaStore.isInitialized = true
    const wrapper = mount(AssessmentEditor, { props: { assessmentId: 'a1' }, global: { stubs } })
    await vi.runOnlyPendingTimersAsync()
    await flushPromises()
    const vm = wrapper.vm as unknown as { showSyncToast: (m: string, a?: () => void) => void }
    vm.showSyncToast('Bijgewerkt')
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(true)
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(false)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('clears an existing timer when a new toast is shown', async () => {
    vi.useFakeTimers()
    schemaStore.isInitialized = true
    const wrapper = mount(AssessmentEditor, { props: { assessmentId: 'a1' }, global: { stubs } })
    await vi.runOnlyPendingTimersAsync()
    await flushPromises()
    const vm = wrapper.vm as unknown as { showSyncToast: (m: string, a?: () => void) => void }
    vm.showSyncToast('Eerste')
    await nextTick()
    vm.showSyncToast('Tweede')
    await nextTick()
    expect(wrapper.find('.sync-toast span').text()).toBe('Tweede')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('dismisses the toast via the action button (action present)', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const action = vi.fn()
    const vm = wrapper.vm as unknown as { showSyncToast: (m: string, a?: () => void) => void }
    vm.showSyncToast('Met actie', action)
    await nextTick()
    const actionBtn = wrapper.find('.sync-toast__action')
    expect(actionBtn.exists()).toBe(true)
    expect(actionBtn.text()).toBe('Bijwerken')
    await actionBtn.trigger('click')
    expect(action).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('dismissSyncToast clears a running timer', async () => {
    vi.useFakeTimers()
    schemaStore.isInitialized = true
    const wrapper = mount(AssessmentEditor, { props: { assessmentId: 'a1' }, global: { stubs } })
    await vi.runOnlyPendingTimersAsync()
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      showSyncToast: (m: string, a?: () => void) => void
      dismissSyncToast: () => void
    }
    vm.showSyncToast('Tijdelijk')
    await nextTick()
    vm.dismissSyncToast()
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(false)
    vi.useRealTimers()
    wrapper.unmount()
  })
})

describe('AssessmentEditor — message formatters', () => {
  it('formats single vs multiple active-section changes', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as {
      formatActiveSectionMessage: (l: string[]) => string
      formatBackgroundMessage: (l: string[]) => string
    }
    expect(vm.formatActiveSectionMessage(['Naam'])).toBe("Een collega heeft een wijziging gemaakt in 'Naam'")
    expect(vm.formatActiveSectionMessage(['A', 'B'])).toBe('Een collega heeft 2 wijzigingen gemaakt in deze sectie')

    expect(vm.formatBackgroundMessage([])).toBe('Bijgewerkt door een collega')
    expect(vm.formatBackgroundMessage(['S1'])).toBe("Sectie 'S1' bijgewerkt door een collega")
    expect(vm.formatBackgroundMessage(['S1', 'S2'])).toBe("Secties 'S1' en 'S2' bijgewerkt door een collega")
    expect(vm.formatBackgroundMessage(['S1', 'S2', 'S3'])).toBe('3 secties bijgewerkt door een collega')
    wrapper.unmount()
  })
})

describe('AssessmentEditor — navigation functions', () => {
  it('goToLanding pushes to the project route when assessment is set', async () => {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const formStub = wrapper.findComponent({ name: 'Form' })
    const navigation = formStub.props('navigation') as {
      goToLanding: () => void
      goToDPIA: () => void
      goToPreScanDPIA: () => void
    }
    navigation.goToLanding()
    expect(routerPush).toHaveBeenCalledWith('/project/p1')
    expect(navigation.goToDPIA()).toBeUndefined()
    expect(navigation.goToPreScanDPIA()).toBeUndefined()
    wrapper.unmount()
  })

  it('goToLanding does nothing when assessment is null (error state)', async () => {
    assessmentsApi.get.mockRejectedValueOnce(new Error('x'))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { navigationFunctions: { goToLanding: () => void } }
    vm.navigationFunctions.goToLanding()
    expect(routerPush).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('namespace and customNamePart fall back when assessment is null', async () => {
    assessmentsApi.get.mockRejectedValueOnce(new Error('x'))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const vm = wrapper.vm as unknown as { namespace: string; customNamePart: string }
    expect(vm.namespace).toBe(FormTypeMock.DPIA)
    expect(vm.customNamePart).toBe('')
    wrapper.unmount()
  })
})

describe('AssessmentEditor — remote change watcher', () => {
  async function boot() {
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    return wrapper
  }

  it('ignores remote-change polling before syncReady', async () => {
    collaborationStore.load.mockRejectedValueOnce(new Error('load faalt'))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    collaborationStore.assessmentVersion = 5
    collaborationStore.assessmentUpdatedAt = '2026-02-02T00:00:00Z'
    await nextTick()
    expect(sync.handleRemoteChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('returns early when there is no polled version', async () => {
    const wrapper = await boot()
    collaborationStore.assessmentVersion = null
    collaborationStore.assessmentUpdatedAt = '2026-02-02T00:00:00Z'
    await nextTick()
    expect(sync.handleRemoteChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('returns early when polled version equals the known version/updatedAt', async () => {
    sync.knownVersion.value = 7
    sync.knownUpdatedAt.value = '2026-02-02T00:00:00Z'
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 7
    collaborationStore.assessmentUpdatedAt = '2026-02-02T00:00:00Z'
    await nextTick()
    expect(sync.handleRemoteChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('bookkeeps own change and bumps known version when newer', async () => {
    collaborationStore.lastModifiedBySelf = true
    sync.knownVersion.value = 2
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 5
    collaborationStore.assessmentUpdatedAt = '2026-03-03T00:00:00Z'
    await nextTick()
    expect(sync.handleRemoteChange).not.toHaveBeenCalled()
    expect(sync.knownVersion.value).toBe(5)
    expect(sync.knownUpdatedAt.value).toBe('2026-03-03T00:00:00Z')
    wrapper.unmount()
  })

  it('bookkeeps own change when knownVersion is undefined', async () => {
    collaborationStore.lastModifiedBySelf = true
    sync.knownVersion.value = undefined
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 9
    collaborationStore.assessmentUpdatedAt = '2026-03-04T00:00:00Z'
    await nextTick()
    expect(sync.knownVersion.value).toBe(9)
    wrapper.unmount()
  })

  it('does not lower the known version for an out-of-order own change without updatedAt', async () => {
    collaborationStore.lastModifiedBySelf = true
    sync.knownVersion.value = 10
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 3
    collaborationStore.assessmentUpdatedAt = null
    await nextTick()
    expect(sync.knownVersion.value).toBe(10)
    expect(sync.handleRemoteChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows the active-section toast and applies deferred changes on action (merged)', async () => {
    collaborationStore.lastModifiedBySelf = false
    sync.handleRemoteChange.mockResolvedValue({
      changeId: 42,
      activeSectionChanges: [{ fieldId: '1.1', newValue: { value: 'x' } }],
      activeSectionFieldLabels: ['Veld A'],
      backgroundMerged: 0,
      backgroundSectionLabels: [],
    })
    sync.applyDeferredChanges.mockResolvedValue('merged')
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 11
    collaborationStore.assessmentUpdatedAt = '2026-04-04T00:00:00Z'
    await flushPromises()
    await nextTick()

    const toast = wrapper.find('.sync-toast')
    expect(toast.exists()).toBe(true)
    expect(toast.find('span').text()).toBe("Een collega heeft een wijziging gemaakt in 'Veld A'")

    await wrapper.find('.sync-toast__action').trigger('click')
    await flushPromises()
    await nextTick()
    expect(sync.applyDeferredChanges).toHaveBeenCalledWith(42)
    expect(wrapper.find('.sync-toast span').text()).toBe('Informatie bijgewerkt')
    wrapper.unmount()
  })

  it('does not show a follow-up toast when deferred apply is not merged', async () => {
    collaborationStore.lastModifiedBySelf = false
    sync.handleRemoteChange.mockResolvedValue({
      changeId: 1,
      activeSectionChanges: [{ fieldId: '2.2', newValue: { value: 'y' } }],
      activeSectionFieldLabels: ['B', 'C'],
      backgroundMerged: 0,
      backgroundSectionLabels: [],
    })
    sync.applyDeferredChanges.mockResolvedValue('conflict')
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 12
    collaborationStore.assessmentUpdatedAt = '2026-04-05T00:00:00Z'
    await flushPromises()
    await nextTick()
    const toast = wrapper.find('.sync-toast')
    expect(toast.find('span').text()).toBe('Een collega heeft 2 wijzigingen gemaakt in deze sectie')

    await wrapper.find('.sync-toast__action').trigger('click')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the background toast when only background changes were merged', async () => {
    collaborationStore.lastModifiedBySelf = false
    sync.handleRemoteChange.mockResolvedValue({
      changeId: 5,
      activeSectionChanges: [],
      activeSectionFieldLabels: [],
      backgroundMerged: 2,
      backgroundSectionLabels: ['Sectie 1', 'Sectie 2'],
    })
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 13
    collaborationStore.assessmentUpdatedAt = '2026-04-06T00:00:00Z'
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.sync-toast span').text()).toBe("Secties 'Sectie 1' en 'Sectie 2' bijgewerkt door een collega")
    wrapper.unmount()
  })

  it('shows no toast when there are neither active nor background changes', async () => {
    collaborationStore.lastModifiedBySelf = false
    sync.handleRemoteChange.mockResolvedValue({
      changeId: 0,
      activeSectionChanges: [],
      activeSectionFieldLabels: [],
      backgroundMerged: 0,
      backgroundSectionLabels: [],
    })
    const wrapper = await boot()
    collaborationStore.assessmentVersion = 14
    collaborationStore.assessmentUpdatedAt = '2026-04-07T00:00:00Z'
    await flushPromises()
    await nextTick()
    expect(wrapper.find('.sync-toast').exists()).toBe(false)
    expect(sync.handleRemoteChange).toHaveBeenCalledWith(taskStore.currentRootTaskId[taskStore.activeNamespace])
    wrapper.unmount()
  })
})

describe('AssessmentEditor — navigate watcher (deferred changes)', () => {
  it('applies deferred changes and dismisses the toast on section navigation', async () => {
    sync.hasDeferredChanges.mockReturnValue(true)
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    taskStore.currentRootTaskId = { ...taskStore.currentRootTaskId, [taskStore.activeNamespace]: '5' }
    await nextTick()
    expect(sync.applyDeferredOnNavigate).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does nothing on navigation when there are no deferred changes', async () => {
    sync.hasDeferredChanges.mockReturnValue(false)
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    taskStore.currentRootTaskId = { ...taskStore.currentRootTaskId, [taskStore.activeNamespace]: '8' }
    await nextTick()
    expect(sync.applyDeferredOnNavigate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('AssessmentEditor — delete modal dialog watcher', () => {
  it('calls showModal/close on the dialog ref when the modal opens and closes', async () => {
    assessmentsApi.get.mockResolvedValueOnce(makeAssessment({ role: 'owner' }))
    schemaStore.isInitialized = true
    const wrapper = await mountEditor()
    const dialog = wrapper.find('dialog.confirm-dialog').element as HTMLDialogElement
    const showModal = vi.spyOn(dialog, 'showModal').mockImplementation(() => {})
    const close = vi.spyOn(dialog, 'close').mockImplementation(() => {})

    await wrapper.find('.kebab-menu__trigger').trigger('click')
    await nextTick()
    await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
    await nextTick()
    expect(showModal).toHaveBeenCalledTimes(1)

    const cancelBtn = wrapper.findAll('.confirm-dialog__actions button').find((b) => b.text() === 'Annuleer')!
    await cancelBtn.trigger('click')
    await nextTick()
    expect(close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

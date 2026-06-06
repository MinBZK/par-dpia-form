/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const projectsGet = vi.fn()
const projectsUpdate = vi.fn()
const projectsDelete = vi.fn()
const assessmentsList = vi.fn()
const assessmentsGet = vi.fn()
const assessmentsCreate = vi.fn()

vi.mock('../../src/api', () => ({
  projects: {
    get: (...a: unknown[]) => projectsGet(...a),
    update: (...a: unknown[]) => projectsUpdate(...a),
    delete: (...a: unknown[]) => projectsDelete(...a),
  },
  assessments: {
    list: (...a: unknown[]) => assessmentsList(...a),
    get: (...a: unknown[]) => assessmentsGet(...a),
    create: (...a: unknown[]) => assessmentsCreate(...a),
  },
}))

const parseAndValidateImport = vi.fn()
const importFromPdf = vi.fn()
const detectImportType = vi.fn()
const autoGrowTextarea = vi.fn()
vi.mock('@overheid-assessment/core', () => ({
  FormType: { DPIA: 'dpia', PRE_SCAN: 'prescan', IAMA: 'iama' },
  parseAndValidateImport: (...a: unknown[]) => parseAndValidateImport(...a),
  importFromPdf: (...a: unknown[]) => importFromPdf(...a),
  detectImportType: (...a: unknown[]) => detectImportType(...a),
  autoGrowTextarea: (...a: unknown[]) => autoGrowTextarea(...a),
}))

import ProjectDetail from '../../src/views/ProjectDetail.vue'

type Role = 'owner' | 'editor' | 'viewer' | undefined

function makeProject(overrides: Partial<{ name: string; description: string; role: Role }> = {}) {
  return {
    id: 'p1',
    name: 'Mijn project',
    description: 'Een beschrijving',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    role: 'owner' as Role,
    ...overrides,
  }
}

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    projectId: 'p1',
    assessmentType: 'prescan',
    name: 'Pre-scan A',
    currentVersion: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  }
}

async function mountDetail(opts: {
  project?: ReturnType<typeof makeProject> | null
  assessments?: Record<string, unknown>[]
  rejectLoad?: boolean
} = {}) {
  if (opts.rejectLoad) {
    projectsGet.mockRejectedValue(new Error('boom'))
    assessmentsList.mockRejectedValue(new Error('boom'))
  } else {
    projectsGet.mockResolvedValue(opts.project === undefined ? makeProject() : opts.project)
    assessmentsList.mockResolvedValue(opts.assessments ?? [])
  }
  const wrapper = mount(ProjectDetail, {
    props: { projectId: 'p1' },
    global: {
      stubs: {
        AppHeader: { template: '<header class="app-header-stub" />' },
        RouterLink: { template: '<a class="router-link-stub"><slot /></a>' },
        IconUsers: { template: '<span class="icon-users" />' },
        IconDotsVertical: { template: '<span class="icon-dots" />' },
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  routerPush.mockClear()
  projectsGet.mockReset()
  projectsUpdate.mockReset()
  projectsDelete.mockReset()
  assessmentsList.mockReset()
  assessmentsGet.mockReset()
  assessmentsCreate.mockReset()
  parseAndValidateImport.mockReset()
  importFromPdf.mockReset()
  detectImportType.mockReset()
  autoGrowTextarea.mockReset()

  // jsdom's <dialog> lacks showModal/close; provide no-op shims for the watchers.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  }
})

describe('ProjectDetail', () => {
  describe('onMounted loading branches', () => {
    it('renders the loading state before data resolves', () => {
      projectsGet.mockReturnValue(new Promise(() => {}))
      assessmentsList.mockReturnValue(new Promise(() => {}))
      const wrapper = mount(ProjectDetail, {
        props: { projectId: 'p1' },
        global: { stubs: { AppHeader: true, RouterLink: true, IconUsers: true, IconDotsVertical: true } },
      })
      expect(wrapper.text()).toContain('Laden...')
    })

    it('shows the error alert when loading rejects', async () => {
      const wrapper = await mountDetail({ rejectLoad: true })
      expect(wrapper.find('.rvo-alert--warning').exists()).toBe(true)
      expect(wrapper.text()).toContain('Kan project niet laden. Probeer het later opnieuw.')
    })

    it('renders the project header once data resolves', async () => {
      const wrapper = await mountDetail({ project: makeProject({ name: 'Klantportaal' }) })
      expect(wrapper.find('h1').text()).toBe('Klantportaal')
    })
  })

  describe('isOwner computed + owner-only actions', () => {
    it('shows "Leden beheren" and the kebab menu for an owner', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      expect(wrapper.text()).toContain('Leden beheren')
      expect(wrapper.find('.kebab-menu').exists()).toBe(true)
    })

    it('hides owner actions for a non-owner (editor)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'editor' }) })
      expect(wrapper.text()).not.toContain('Leden beheren')
      expect(wrapper.find('.kebab-menu').exists()).toBe(false)
    })

    it('navigates to the members page when "Leden beheren" is clicked', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const btn = wrapper.findAll('button').find((b) => b.text().includes('Leden beheren'))!
      await btn.trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/project/p1/leden')
    })
  })

  describe('kebab menu open/close + focusout', () => {
    it('toggles the dropdown open and closes it on focusout', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const trigger = wrapper.find('.kebab-menu__trigger')
      expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
      await trigger.trigger('click')
      expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(true)
      expect(trigger.attributes('aria-expanded')).toBe('true')
      await wrapper.find('.kebab-menu').trigger('focusout')
      expect(wrapper.find('.kebab-menu__dropdown').exists()).toBe(false)
    })

    it('opens the delete modal from the dropdown item (mousedown)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('.kebab-menu__trigger').trigger('click')
      await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
      await flushPromises()
      expect(wrapper.find('dialog.confirm-dialog').attributes('open')).toBe('')
    })
  })

  describe('editable name (startEditName / saveName / cancelName)', () => {
    it('does not enter edit mode when the role is not editable', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer' }) })
      const h1 = wrapper.find('h1')
      expect(h1.classes()).not.toContain('editable-field')
      await h1.trigger('click')
      expect(wrapper.find('input[aria-label="Projectnaam"]').exists()).toBe(false)
    })

    it('enters edit mode for an editable role and focuses/selects the input', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find<HTMLInputElement>('input[aria-label="Projectnaam"]')
      expect(input.exists()).toBe(true)
      expect(input.element.value).toBe('Oud')
    })

    it('enters edit mode via the Enter key on the heading', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('h1').trigger('keydown.enter')
      await flushPromises()
      expect(wrapper.find('input[aria-label="Projectnaam"]').exists()).toBe(true)
    })

    it('saves a changed name and updates the project', async () => {
      projectsUpdate.mockResolvedValue({ name: 'Nieuw' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('input[aria-label="Projectnaam"]')
      await input.setValue('Nieuw')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { name: 'Nieuw' })
      expect(wrapper.find('h1').text()).toBe('Nieuw')
    })

    it('does not call update when the trimmed name is empty', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('input[aria-label="Projectnaam"]')
      await input.setValue('   ')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
      expect(wrapper.find('h1').text()).toBe('Oud')
    })

    it('does not call update when the trimmed name is unchanged', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('input[aria-label="Projectnaam"]')
      await input.setValue('  Oud  ')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
    })

    it('cancels name editing with the Escape key', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('input[aria-label="Projectnaam"]')
      await input.trigger('keydown.escape')
      await flushPromises()
      expect(wrapper.find('input[aria-label="Projectnaam"]').exists()).toBe(false)
    })
  })

  describe('editable description (startEditDescription / saveDescription / cancelDescription)', () => {
    it('shows the "Beschrijving toevoegen" affordance when editable and description empty', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: '' }) })
      expect(wrapper.find('.description-add').exists()).toBe(true)
      expect(wrapper.text()).toContain('Beschrijving toevoegen')
    })

    it('does not show the affordance for a non-editable role with empty description', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer', description: '' }) })
      expect(wrapper.find('.description-add').exists()).toBe(false)
    })

    it('does not enter description edit mode when not editable', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer', description: 'Tekst' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      expect(wrapper.find('textarea[aria-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('enters description edit mode from the paragraph and autosizes', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Bestaand' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      const ta = wrapper.find<HTMLTextAreaElement>('textarea[aria-label="Projectbeschrijving"]')
      expect(ta.exists()).toBe(true)
      expect(ta.element.value).toBe('Bestaand')
      expect(autoGrowTextarea).toHaveBeenCalled()
    })

    it('enters description edit mode from the empty-add affordance (description || "")', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: '' }) })
      await wrapper.find('.description-add').trigger('click')
      await flushPromises()
      const ta = wrapper.find<HTMLTextAreaElement>('textarea[aria-label="Projectbeschrijving"]')
      expect(ta.exists()).toBe(true)
      expect(ta.element.value).toBe('')
    })

    it('autosizes on input', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Verwerking van klantgegevens' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      autoGrowTextarea.mockClear()
      await wrapper.find('textarea[aria-label="Projectbeschrijving"]').trigger('input')
      expect(autoGrowTextarea).toHaveBeenCalled()
    })

    it('saves a changed description', async () => {
      projectsUpdate.mockResolvedValue({ description: 'Vernieuwd' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Oud' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      const ta = wrapper.find('textarea[aria-label="Projectbeschrijving"]')
      await ta.setValue('Vernieuwd')
      const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!
      await saveBtn.trigger('click')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { description: 'Vernieuwd' })
      expect(wrapper.text()).toContain('Vernieuwd')
    })

    it('does not save when the trimmed description is unchanged (description || "")', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Zelfde' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      const ta = wrapper.find('textarea[aria-label="Projectbeschrijving"]')
      await ta.setValue('  Zelfde  ')
      const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!
      await saveBtn.trigger('click')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
      expect(wrapper.find('textarea[aria-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('treats a null description as "" when unchanged on save', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: undefined as unknown as string }) })
      await wrapper.find('.description-add').trigger('click')
      await flushPromises()
      const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'Opslaan')!
      await saveBtn.trigger('click')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
    })

    it('cancels description editing with Escape', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Verwerking van klantgegevens' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      await wrapper.find('textarea[aria-label="Projectbeschrijving"]').trigger('keydown.escape')
      await flushPromises()
      expect(wrapper.find('textarea[aria-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('cancels description editing with the Annuleer button', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Verwerking van klantgegevens' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Annuleer')!
      await cancelBtn.trigger('click')
      await flushPromises()
      expect(wrapper.find('textarea[aria-label="Projectbeschrijving"]').exists()).toBe(false)
    })
  })

  describe('existing assessments list + formatDate', () => {
    it('renders the existing-assessment section with a formatted date', async () => {
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'a1', name: 'Bestaand', updatedAt: '2026-03-20T12:00:00Z' })],
      })
      expect(wrapper.text()).toContain('Ga verder met een bestaande assessment')
      expect(wrapper.text()).toContain('Bestaand')
      expect(wrapper.text()).toContain('20 maart 2026')
    })

    it('omits the existing-assessment section when there are none', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }), assessments: [] })
      expect(wrapper.text()).not.toContain('Ga verder met een bestaande assessment')
    })
  })

  describe('"Start een nieuwe assessment" visibility', () => {
    it('shows the start cards for an editor', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'editor' }) })
      expect(wrapper.text()).toContain('Start een nieuwe assessment')
    })

    it('hides the start cards for a viewer', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer' }) })
      expect(wrapper.text()).not.toContain('Start een nieuwe assessment')
    })
  })

  describe('start dialog open/close', () => {
    it('opens the DPIA dialog with the DPIA heading', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const startDpia = wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!
      await startDpia.trigger('click')
      await flushPromises()
      expect(wrapper.find('dialog.start-dialog').attributes('open')).toBe('')
      expect(wrapper.text()).toContain('Hoe wil je de DPIA starten?')
    })

    it('opens the pre-scan dialog with the pre-scan heading', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const startPrescan = wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!
      await startPrescan.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Hoe wil je de pre-scan starten?')
    })

    it('closes the dialog via the Annuleer button (closeDialog → watcher close)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const cancel = dialog.findAll('button').find((b) => b.text() === 'Annuleer')!
      await cancel.trigger('click')
      await flushPromises()
      expect(dialog.attributes('open')).toBeUndefined()
    })

    it('runs closeDialog when the native dialog @close event fires', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.trigger('close')
      await flushPromises()
      expect(dialog.attributes('open')).toBeUndefined()
    })
  })

  describe('submitDpiaDialog branches', () => {
    it('creates an empty DPIA and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'new1' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const submit = dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!
      await submit.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'dpia')
      expect(routerPush).toHaveBeenCalledWith('/assessment/new1')
    })

    it('shows an error when prescan-project is chosen without a selection', async () => {
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const radio = dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-project')!
      await radio.setValue()
      await flushPromises()
      const submit = dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!
      await submit.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Selecteer een pre-scan')
    })

    it('errors when the selected pre-scan has no answers (undefined state)', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1' })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-project')!.setValue()
      await flushPromises()
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'ps1')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('De geselecteerde pre-scan bevat geen ingevulde gegevens')
    })

    it('errors when the selected pre-scan has empty answers object', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1', state: { answers: {} } })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-project')!.setValue()
      await flushPromises()
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'ps1')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('De geselecteerde pre-scan bevat geen ingevulde gegevens')
    })

    it('takes over answers from a plain (non-namespaced) pre-scan', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1', state: { answers: { '0.1': { value: 'x' } } } })
      assessmentsCreate.mockResolvedValue({ id: 'dpia-from-ps' })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-project')!.setValue()
      await flushPromises()
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'ps1')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith(
        'p1',
        'dpia',
        undefined,
        expect.objectContaining({ _prescanAnswers: { '0.1': { value: 'x' } }, answers: {} }),
      )
      expect(routerPush).toHaveBeenCalledWith('/assessment/dpia-from-ps')
    })

    it('unwraps an old namespace-wrapped pre-scan ({ prescan: {...} })', async () => {
      assessmentsGet.mockResolvedValue({
        id: 'ps1',
        state: { answers: { prescan: { '0.1': { value: 'wrapped' } } } },
      })
      assessmentsCreate.mockResolvedValue({ id: 'dpia2' })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-project')!.setValue()
      await flushPromises()
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'ps1')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith(
        'p1',
        'dpia',
        undefined,
        expect.objectContaining({ _prescanAnswers: { '0.1': { value: 'wrapped' } } }),
      )
    })

    it('errors when import option chosen without a file', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Selecteer een JSON- of PDF-bestand')
      expect(assessmentsCreate).not.toHaveBeenCalled()
    })

    it('imports a DPIA file (detectImportType=dpia) and uses the parsed state directly', async () => {
      detectImportType.mockReturnValue('dpia')
      const parsed = { answers: { '1.1': { value: 'a' } }, metadata: {} }
      parseAndValidateImport.mockReturnValue(parsed)
      assessmentsCreate.mockResolvedValue({ id: 'dpia-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()

      const file = new File([JSON.stringify({ answers: { '1.1': { value: 'a' } } })], 'dpia.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()

      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'dpia', undefined, parsed)
      expect(routerPush).toHaveBeenCalledWith('/assessment/dpia-import')
    })

    it('imports a pre-scan file (detectImportType=prescan) and wraps it as _prescanAnswers', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({ answers: { '0.1': { value: 'p' } } })
      assessmentsCreate.mockResolvedValue({ id: 'dpia-from-import-ps' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()

      const file = new File([JSON.stringify({ answers: { '0.1': { value: 'p' } } })], 'ps.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()

      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith(
        'p1',
        'dpia',
        undefined,
        expect.objectContaining({ _prescanAnswers: { '0.1': { value: 'p' } }, answers: {} }),
      )
    })

    it('surfaces a thrown error message via dialogError', async () => {
      detectImportType.mockReturnValue('dpia')
      parseAndValidateImport.mockImplementation(() => {
        throw new Error('Ongeldig bestand')
      })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Ongeldig bestand')
    })

    it('falls back to a default message when the thrown error has no message', async () => {
      assessmentsCreate.mockRejectedValue({})
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Er is iets misgegaan')
    })
  })

  describe('submitPrescanDialog branches', () => {
    it('creates an empty pre-scan and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'ps-new' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const submit = dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!
      await submit.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'prescan')
      expect(routerPush).toHaveBeenCalledWith('/assessment/ps-new')
    })

    it('errors when prescan upload chosen without a file', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Selecteer een JSON- of PDF-bestand')
    })

    it('errors when the uploaded pre-scan file has no answers', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({ answers: {} })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      const file = new File(['{}'], 'ps.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Het bestand bevat geen pre-scan antwoorden')
    })

    it('errors when the uploaded pre-scan file has a missing answers field', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({})
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      const file = new File(['{}'], 'ps.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Het bestand bevat geen pre-scan antwoorden')
    })

    it('creates a pre-scan from a valid uploaded file', async () => {
      detectImportType.mockReturnValue('prescan')
      const state = { answers: { '0.1': { value: 'inhoud' } } }
      parseAndValidateImport.mockReturnValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'ps-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      const file = new File([JSON.stringify(state)], 'ps.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'prescan', undefined, state)
      expect(routerPush).toHaveBeenCalledWith('/assessment/ps-import')
    })
  })

  describe('onFileChange null branch', () => {
    it('sets uploadFile to null when no file is selected (files?.[0] ?? null)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: null, configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Selecteer een JSON- of PDF-bestand')
    })
  })

  describe('dialog submit-button label + disabled state', () => {
    it('shows "Bezig..." while submitting then resolves', async () => {
      let resolveCreate: (v: unknown) => void = () => {}
      assessmentsCreate.mockReturnValue(new Promise((r) => { resolveCreate = r }))
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const submit = dialog.findAll('button').find((b) => b.text() === 'Start DPIA')!
      await submit.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Bezig...')
      resolveCreate({ id: 'x' })
      await flushPromises()
    })
  })

  describe('delete project flow', () => {
    it('disables the delete button until VERWIJDEREN is typed', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Te wissen' }) })
      await wrapper.find('.kebab-menu__trigger').trigger('click')
      await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
      await flushPromises()
      const deleteBtn = wrapper.find('.confirm-dialog__delete')
      expect(deleteBtn.attributes('disabled')).toBeDefined()
      expect(deleteBtn.classes()).toContain('confirm-dialog__delete--disabled')
      expect(wrapper.find('.confirm-dialog').text()).toContain('Te wissen')
    })

    it('enables and confirms deletion when VERWIJDEREN is typed', async () => {
      projectsDelete.mockResolvedValue(undefined)
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('.kebab-menu__trigger').trigger('click')
      await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
      await flushPromises()
      const confirmInput = wrapper.find('.confirm-dialog__input')
      await confirmInput.setValue('VERWIJDEREN')
      const deleteBtn = wrapper.find('.confirm-dialog__delete')
      expect(deleteBtn.attributes('disabled')).toBeUndefined()
      expect(deleteBtn.classes()).toContain('utrecht-button--primary-action')
      await deleteBtn.trigger('click')
      await flushPromises()
      expect(projectsDelete).toHaveBeenCalledWith('p1')
      expect(routerPush).toHaveBeenCalledWith('/projecten')
    })

    it('closes the delete modal via Annuleer and clears the input', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('.kebab-menu__trigger').trigger('click')
      await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
      await flushPromises()
      const confirmInput = wrapper.find('.confirm-dialog__input')
      await confirmInput.setValue('iets')
      const cancel = wrapper.find('.confirm-dialog').findAll('button').find((b) => b.text() === 'Annuleer')!
      await cancel.trigger('click')
      await flushPromises()
      expect(wrapper.find('dialog.confirm-dialog').attributes('open')).toBeUndefined()
      expect((wrapper.find('.confirm-dialog__input').element as HTMLInputElement).value).toBe('')
    })

    it('runs the @close handler when the delete dialog emits close', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('.kebab-menu__trigger').trigger('click')
      await wrapper.find('.kebab-menu__item--danger').trigger('mousedown')
      await flushPromises()
      const dialog = wrapper.find('dialog.confirm-dialog')
      await dialog.trigger('close')
      await flushPromises()
      expect(dialog.attributes('open')).toBeUndefined()
    })
  })

  describe('"empty" radio re-selection (inline v-model update handler)', () => {
    it('re-selects the empty DPIA option after switching to import', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const radios = () => dialog.findAll('input[type="radio"]')
      await radios().find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const emptyRadio = radios().find((r) => (r.element as HTMLInputElement).value === 'empty')!
      await emptyRadio.setValue()
      await flushPromises()
      expect((emptyRadio.element as HTMLInputElement).checked).toBe(true)
    })

    it('re-selects the empty pre-scan option after switching to upload', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const radios = () => dialog.findAll('input[type="radio"]')
      await radios().find((r) => (r.element as HTMLInputElement).value === 'prescan-json-upload')!.setValue()
      await flushPromises()
      const emptyRadio = radios().find((r) => (r.element as HTMLInputElement).value === 'empty')!
      await emptyRadio.setValue()
      await flushPromises()
      expect((emptyRadio.element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('internal helpers reached via the component instance', () => {
    it('formTypeLabel returns "DPIA" for dpia and "Pre-scan" otherwise', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { formTypeLabel: (t: string) => string }
      expect(vm.formTypeLabel('dpia')).toBe('DPIA')
      expect(vm.formTypeLabel('prescan')).toBe('Pre-scan')
    })

    it('autosizeTextarea is a no-op when no textarea is mounted (descriptionInput null)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { autosizeTextarea: () => void }
      vm.autosizeTextarea()
      expect(autoGrowTextarea).not.toHaveBeenCalled()
    })

    it('submitDpiaDialog falls through when the option is not a DPIA option', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { dialogOption: string; submitDpiaDialog: () => Promise<void> }
      vm.dialogOption = 'prescan-json-upload'
      await vm.submitDpiaDialog()
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('submitPrescanDialog falls through when the option is not a pre-scan option', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { dialogOption: string; submitPrescanDialog: () => Promise<void> }
      vm.dialogOption = 'import'
      await vm.submitPrescanDialog()
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('submitIamaDialog falls through when the option is neither empty nor import', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { dialogOption: string; submitIamaDialog: () => Promise<void> }
      vm.dialogOption = 'prescan-project'
      await vm.submitIamaDialog()
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('formTypeLabel returns "IAMA" for iama', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { formTypeLabel: (t: string) => string }
      expect(vm.formTypeLabel('iama')).toBe('IAMA')
    })
  })

  describe('IAMA start dialog', () => {
    it('opens the IAMA dialog with the IAMA heading and start button', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const startIama = wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!
      await startIama.trigger('click')
      await flushPromises()
      expect(wrapper.find('dialog.start-dialog').attributes('open')).toBe('')
      expect(wrapper.text()).toContain('Hoe wil je de IAMA starten?')
      expect(wrapper.text()).toContain('Start een nieuwe IAMA')
    })

    it('creates an empty IAMA and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'iama-new' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const submit = dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!
      await submit.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama')
      expect(routerPush).toHaveBeenCalledWith('/assessment/iama-new')
    })

    it('errors when IAMA import is chosen without a file', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Selecteer een JSON- of PDF-bestand')
      expect(assessmentsCreate).not.toHaveBeenCalled()
    })

    it('imports a valid IAMA JSON file and creates the assessment', async () => {
      detectImportType.mockReturnValue('iama')
      const state = { answers: { '1.1': { value: 'a' } }, metadata: {} }
      parseAndValidateImport.mockReturnValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'iama-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const file = new File([JSON.stringify(state)], 'iama.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama', undefined, state)
      expect(routerPush).toHaveBeenCalledWith('/assessment/iama-import')
    })

    it('re-selects the empty IAMA option after switching to import', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      const radios = () => dialog.findAll('input[type="radio"]')
      await radios().find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const emptyRadio = radios().find((r) => (r.element as HTMLInputElement).value === 'empty')!
      await emptyRadio.setValue()
      await flushPromises()
      expect((emptyRadio.element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('parseUploadedFile PDF branch + assertImportTypeMatches mismatch', () => {
    it('routes a .pdf upload through importFromPdf', async () => {
      detectImportType.mockReturnValue('iama')
      const state = { answers: { '1.1': { value: 'pdf' } }, metadata: {} }
      importFromPdf.mockResolvedValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'iama-pdf' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const file = new File(['%PDF-1.4'], 'iama.PDF', { type: 'application/pdf' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(importFromPdf).toHaveBeenCalledWith(file)
      expect(parseAndValidateImport).not.toHaveBeenCalled()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama', undefined, state)
    })

    it('rejects an IAMA import whose detected type is a DPIA (mismatch error)', async () => {
      detectImportType.mockReturnValue('dpia')
      parseAndValidateImport.mockReturnValue({ answers: { '1.1': { value: 'x' } } })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Het bestand bevat een DPIA-assessment, maar er werd een IAMA-bestand verwacht.')
    })

    it('rejects an import whose type is undetectable (detected=null → "onbekend")', async () => {
      detectImportType.mockReturnValue(null)
      parseAndValidateImport.mockReturnValue({ answers: {} })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('dialog.start-dialog')
      await dialog.findAll('input[type="radio"]').find((r) => (r.element as HTMLInputElement).value === 'import')!.setValue()
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileInput = dialog.find('input[type="file"]')
      Object.defineProperty(fileInput.element, 'files', { value: [file], configurable: true })
      await fileInput.trigger('change')
      await flushPromises()
      await dialog.findAll('button').find((b) => b.text() === 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Het bestand bevat een onbekend-assessment, maar er werd een IAMA-bestand verwacht.')
    })
  })
})

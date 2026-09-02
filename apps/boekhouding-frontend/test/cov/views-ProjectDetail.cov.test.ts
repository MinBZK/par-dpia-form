/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const backLinkSet = vi.fn()
vi.mock('../../src/composables/useBackLink', () => ({
  useBackLink: () => ({ set: backLinkSet }),
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
    list: async (...a: unknown[]) => {
      const r = await assessmentsList(...a)
      return Array.isArray(r) ? { items: r, total: r.length } : r
    },
    get: (...a: unknown[]) => assessmentsGet(...a),
    create: (...a: unknown[]) => assessmentsCreate(...a),
  },
}))

const parseAndValidateImport = vi.fn()
const importFromPdf = vi.fn()
const detectImportType = vi.fn()
vi.mock('@overheid-assessment/core', () => ({
  FormType: { DPIA: 'dpia', PRE_SCAN: 'prescan', IAMA: 'iama' },
  parseAndValidateImport: (...a: unknown[]) => parseAndValidateImport(...a),
  importFromPdf: (...a: unknown[]) => importFromPdf(...a),
  detectImportType: (...a: unknown[]) => detectImportType(...a),
}))

import ProjectDetail from '../../src/views/ProjectDetail.vue'
import { nextTick } from 'vue'

// The design system's radio reports its choice in a change event; picking one
// means dispatching that, not setting a native input's value.
const pickRadio = async (wrapper: { findAll: (s: string) => { element: Element }[] }, value: string) => {
  const radio = wrapper.findAll('nldd-radio-button').find((r) => r.element.getAttribute('value') === value)
  if (!radio) throw new Error(`geen radio met value "${value}"`)
  radio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
  await nextTick()
}


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
        RouterLink: { template: '<a class="router-link-stub"><slot /></a>' },
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// NLDD buttons carry their label in the `text` attribute (shadow DOM), so
// wrapper.text() never contains it; find them by attribute instead.
function findButton(root: VueWrapper | DOMWrapper<Element>, text: string) {
  return root.findAll('nldd-button').find((b) => b.attributes('text') === text)
}

// NLDD fields deliver values via CustomEvent detail; simulate exactly that.
async function setField(field: DOMWrapper<Element>, value: string) {
  field.element.dispatchEvent(new CustomEvent('input', { detail: { value } }))
  await flushPromises()
}

// The nldd-modal-dialog custom element is not registered in jsdom; its
// imperative show/hide API is stubbed per test on the host element.
function stubModal(wrapper: VueWrapper, selector: string) {
  const host = wrapper.find(selector).element as HTMLElement & {
    show?: () => void
    hide?: () => void
  }
  host.show = vi.fn()
  host.hide = vi.fn()
  return host as HTMLElement & { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> }
}

// Both owner actions live in the Projectacties menu; delete is the second item.
const menuItem = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('nldd-menu-item').find((i) => i.attributes('text') === text)

async function openDeleteDialog(wrapper: VueWrapper) {
  await menuItem(wrapper, 'Project verwijderen')!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  routerPush.mockClear()
  backLinkSet.mockReset()
  projectsGet.mockReset()
  projectsUpdate.mockReset()
  projectsDelete.mockReset()
  assessmentsList.mockReset()
  assessmentsGet.mockReset()
  assessmentsCreate.mockReset()
  parseAndValidateImport.mockReset()
  importFromPdf.mockReset()
  detectImportType.mockReset()
})

describe('ProjectDetail', () => {
  describe('onMounted loading branches', () => {
    it('renders the loading state before data resolves', () => {
      projectsGet.mockReturnValue(new Promise(() => {}))
      assessmentsList.mockReturnValue(new Promise(() => {}))
      const wrapper = mount(ProjectDetail, {
        props: { projectId: 'p1' },
        global: { stubs: { RouterLink: true } },
      })
      expect(wrapper.text()).toContain('Laden...')
    })

    it('shows the warning banner when loading rejects', async () => {
      const wrapper = await mountDetail({ rejectLoad: true })
      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('text')).toBe('Kan project niet laden. Probeer het later opnieuw.')
    })

    it('renders the project header once data resolves', async () => {
      const wrapper = await mountDetail({ project: makeProject({ name: 'Klantportaal' }) })
      expect(wrapper.find('h1').text()).toBe('Klantportaal')
    })

    it('renders neither banner nor content when the project resolves empty', async () => {
      const wrapper = await mountDetail({ project: null })
      expect(wrapper.find('nldd-banner').exists()).toBe(false)
      expect(wrapper.find('h1').exists()).toBe(false)
    })
  })

  describe('back link', () => {
    it('declares the back link to the projects overview in the top bar', async () => {
      await mountDetail()
      expect(backLinkSet).toHaveBeenCalledWith({ text: 'Projecten', to: '/projecten' })
    })
  })

  describe('isOwner computed + owner-only actions', () => {
    it('puts both owner actions in the Projectacties menu', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      expect(wrapper.find('nldd-icon-button[popup-type="menu"]').exists()).toBe(true)
      expect(findButton(wrapper, 'Leden beheren')).toBeUndefined()
      expect(menuItem(wrapper, 'Leden beheren')).toBeDefined()
      expect(menuItem(wrapper, 'Project verwijderen')).toBeDefined()
    })

    it('hides owner actions for a non-owner (editor)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'editor' }) })
      expect(menuItem(wrapper, 'Leden beheren')).toBeUndefined()
      expect(wrapper.find('nldd-icon-button[popup-type="menu"]').exists()).toBe(false)
    })

    it('navigates to the members page when "Leden beheren" is clicked', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await menuItem(wrapper, 'Leden beheren')!.trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/project/p1/leden')
    })
  })

  describe('project actions menu (KebabMenu + nldd-menu-item)', () => {
    it('renders the destructive "Project verwijderen" item behind the Projectacties trigger', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      expect(wrapper.find('nldd-icon-button').attributes('text')).toBe('Projectacties')
      const item = menuItem(wrapper, 'Project verwijderen')!
      expect(item.attributes('destructive')).toBeDefined()
      expect(menuItem(wrapper, 'Leden beheren')!.attributes('destructive')).toBeUndefined()
    })

    it('opens the delete modal (show()) when the menu item is clicked', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="delete-project-dialog"]')
      await openDeleteDialog(wrapper)
      expect(modal.show).toHaveBeenCalledTimes(1)
    })
  })

  describe('editable name (startEditName / saveName / cancelName)', () => {
    it('does not enter edit mode when the role is not editable', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer' }) })
      const h1 = wrapper.find('h1')
      expect(h1.classes()).not.toContain('editable-field')
      await h1.trigger('click')
      expect(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').exists()).toBe(false)
    })

    it('enters edit mode for an editable role with the current name as value', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      expect(input.exists()).toBe(true)
      expect(input.attributes('value')).toBe('Oud')
    })

    it('enters edit mode via the Enter key on the heading', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('h1').trigger('keydown.enter')
      await flushPromises()
      expect(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').exists()).toBe(true)
    })

    it('saves a changed name and updates the project', async () => {
      projectsUpdate.mockResolvedValue({ name: 'Nieuw' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      await setField(input, 'Nieuw')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { name: 'Nieuw' })
      expect(wrapper.find('h1').text()).toBe('Nieuw')
    })

    it('saves via the Opslaan button', async () => {
      projectsUpdate.mockResolvedValue({ name: 'Nieuw' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      await setField(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]'), 'Nieuw')
      const actions = wrapper.get('.editable-field-group nldd-container[layout="row"]')
      expect(actions.attributes('gap')).toBe('8')
      expect(actions.attributes('padding-top')).toBe('8')
      await findButton(actions, 'Opslaan')!.trigger('click')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { name: 'Nieuw' })
    })

    it('does not call update when the trimmed name is empty', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      await setField(input, '   ')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
      expect(wrapper.find('h1').text()).toBe('Oud')
    })

    it('does not call update when the trimmed name is unchanged', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      await setField(input, '  Oud  ')
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
    })

    it('cancels name editing with the Escape key', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      await input.trigger('keydown.escape')
      await flushPromises()
      expect(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').exists()).toBe(false)
    })

    it('cancels name editing with the Annuleer button', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      await findButton(wrapper.find('.editable-field-group'), 'Annuleer')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').exists()).toBe(false)
    })

    it('selects the name via the shadow input when the field is upgraded', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const host = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').element
      const select = vi.fn()
      Object.defineProperty(host, 'shadowRoot', {
        value: { querySelector: () => ({ select }) },
        configurable: true,
      })
      await (wrapper.vm as unknown as { startEditName: () => Promise<void> }).startEditName()
      expect(select).toHaveBeenCalledTimes(1)
    })

    it('skips selecting when the shadow root exposes no input', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const host = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').element
      Object.defineProperty(host, 'shadowRoot', {
        value: { querySelector: () => null },
        configurable: true,
      })
      await (wrapper.vm as unknown as { startEditName: () => Promise<void> }).startEditName()
      expect(wrapper.find('nldd-text-field[accessible-label="Projectnaam"]').exists()).toBe(true)
    })

    it('falls back to target.value when an input event carries no detail', async () => {
      projectsUpdate.mockResolvedValue({ name: 'Native' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Oud' }) })
      await wrapper.find('h1').trigger('click')
      await flushPromises()
      const input = wrapper.find('nldd-text-field[accessible-label="Projectnaam"]')
      ;(input.element as unknown as HTMLInputElement).value = 'Native'
      input.element.dispatchEvent(new Event('input'))
      await flushPromises()
      await input.trigger('keydown.enter')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { name: 'Native' })
    })
  })

  describe('editable description (startEditDescription / saveDescription / cancelDescription)', () => {
    it('shows the "Beschrijving toevoegen" affordance when editable and description empty', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: '' }) })
      // A real button now: the label rides on the text attribute, and it is
      // visible from the start instead of appearing on hover.
      expect(wrapper.find('.description-add').attributes('text')).toBe('Beschrijving toevoegen')
    })

    it('does not show the affordance for a non-editable role with empty description', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer', description: '' }) })
      expect(wrapper.find('.description-add').exists()).toBe(false)
    })

    it('does not enter description edit mode when not editable', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer', description: 'Tekst' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('enters description edit mode from the paragraph with an auto-growing field', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Bestaand' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      const ta = wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]')
      expect(ta.exists()).toBe(true)
      expect(ta.attributes('value')).toBe('Bestaand')
      expect(ta.attributes('resize')).toBe('auto')
    })

    it('enters description edit mode from the empty-add affordance (description || "")', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: '' }) })
      await wrapper.find('.description-add').trigger('click')
      await flushPromises()
      const ta = wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]')
      expect(ta.exists()).toBe(true)
      expect(ta.attributes('value')).toBe('')
    })

    it('saves a changed description', async () => {
      projectsUpdate.mockResolvedValue({ description: 'Vernieuwd' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Oud' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      await setField(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]'), 'Vernieuwd')
      await findButton(wrapper.find('.editable-field-group'), 'Opslaan')!.trigger('click')
      await flushPromises()
      expect(projectsUpdate).toHaveBeenCalledWith('p1', { description: 'Vernieuwd' })
      expect(wrapper.text()).toContain('Vernieuwd')
    })

    it('does not save when the trimmed description is unchanged (description || "")', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Zelfde' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      await setField(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]'), '  Zelfde  ')
      await findButton(wrapper.find('.editable-field-group'), 'Opslaan')!.trigger('click')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
      expect(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('treats a null description as "" when unchanged on save', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: undefined as unknown as string }) })
      await wrapper.find('.description-add').trigger('click')
      await flushPromises()
      await findButton(wrapper.find('.editable-field-group'), 'Opslaan')!.trigger('click')
      await flushPromises()
      expect(projectsUpdate).not.toHaveBeenCalled()
    })

    it('cancels description editing with Escape', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Verwerking van klantgegevens' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      await wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]').trigger('keydown.escape')
      await flushPromises()
      expect(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]').exists()).toBe(false)
    })

    it('cancels description editing with the Annuleer button', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', description: 'Verwerking van klantgegevens' }) })
      await wrapper.find('p.preserve-whitespace').trigger('click')
      await flushPromises()
      await findButton(wrapper.find('.editable-field-group'), 'Annuleer')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-multi-line-text-field[accessible-label="Projectbeschrijving"]').exists()).toBe(false)
    })
  })

  describe('existing assessments list + formatDate', () => {
    it('renders the existing-assessment cards with a formatted date', async () => {
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'a1', name: 'Bestaand', updatedAt: '2026-03-20T12:00:00Z' })],
      })
      expect(wrapper.text()).toContain('Ga verder met een bestaande assessment')
      const card = wrapper.get('nldd-collection > nldd-card[href="/assessment/a1"]')
      expect(card.attributes('accessible-label')).toBe('Open assessment Bestaand')
      expect(wrapper.find('nldd-collection').attributes('layout')).toBe('grid')
      expect(wrapper.text()).toContain('Bestaand')
      const meta = card.get('nldd-text')
      expect(meta.attributes('size')).toBe('xs')
      expect(meta.attributes('color')).toBe('secondary')
      expect(meta.text()).toBe('Laatst bewerkt: 20 maart 2026')
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
      const cards = wrapper.findAll('nldd-card')
      expect(cards).toHaveLength(3)
      // The start button sits in the card footer slot so it stays bottom-aligned.
      expect(cards.map((c) => c.get('nldd-container[slot="footer"] nldd-button').attributes('text'))).toEqual([
        'Start pre-scan',
        'Start DPIA',
        'Start IAMA',
      ])
    })

    it('hides the start cards for a viewer', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'viewer' }) })
      expect(wrapper.text()).not.toContain('Start een nieuwe assessment')
    })
  })

  describe('start dialog open/close', () => {
    it('opens the DPIA dialog (show()) with the DPIA title', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(modal.show).toHaveBeenCalledTimes(1)
      expect(wrapper.find('nldd-modal-dialog[data-test="start-dialog"]').attributes('text')).toBe('Hoe wil je de DPIA starten?')
    })

    it('opens the pre-scan dialog with the pre-scan title', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('nldd-modal-dialog[data-test="start-dialog"]').attributes('text')).toBe('Hoe wil je de pre-scan starten?')
    })

    it('closes the dialog via the Annuleer button (closeDialog → watcher hide())', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Annuleer')!.trigger('click')
      await flushPromises()
      expect(modal.hide).toHaveBeenCalledTimes(1)
    })

    it('runs closeDialog when the modal close event fires (Esc / backdrop)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      wrapper.find('nldd-modal-dialog[data-test="start-dialog"]').element.dispatchEvent(new CustomEvent('close'))
      await flushPromises()
      expect(modal.hide).toHaveBeenCalledTimes(1)
    })

    it('ignores open/close toggles while the dialog element is not mounted (syncDialog guard)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { startDialogRef: HTMLElement | null; dialogOpen: boolean }
      vm.startDialogRef = null
      vm.dialogOpen = true
      await flushPromises()
      expect(wrapper.exists()).toBe(true)
    })
  })

  describe('submitDpiaDialog branches', () => {
    it('creates an empty DPIA and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'new1' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'dpia')
      expect(routerPush).toHaveBeenCalledWith('/assessment/new1')
    })

    it('shows an error when prescan-project is chosen without a selection', async () => {
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      const radio = dialog.findAll('nldd-radio-button').find((r) => r.element.getAttribute('value') === 'prescan-project')!
      radio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Selecteer een pre-scan')
    })

    it('errors when the selected pre-scan has no answers (undefined state)', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1' })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-project')
      await flushPromises()
      await pickRadio(dialog, 'ps1')
      await flushPromises()
      // The outgoing radio fires a change too; that one must not clear the pick.
      dialog.findAll('nldd-radio-button').find((r) => r.element.getAttribute('value') === 'ps1')!.element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await nextTick()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('De geselecteerde pre-scan bevat geen ingevulde gegevens')
    })

    it('errors when the selected pre-scan has empty answers object', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1', state: { answers: {} } })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-project')
      await flushPromises()
      await pickRadio(dialog, 'ps1')
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('De geselecteerde pre-scan bevat geen ingevulde gegevens')
    })

    it('takes over answers from a plain (non-namespaced) pre-scan', async () => {
      assessmentsGet.mockResolvedValue({ id: 'ps1', state: { answers: { '0.1': { value: 'x' } } } })
      assessmentsCreate.mockResolvedValue({ id: 'dpia-from-ps' })
      const wrapper = await mountDetail({
        project: makeProject({ role: 'owner' }),
        assessments: [makeAssessment({ id: 'ps1', assessmentType: 'prescan', name: 'PS1' })],
      })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-project')
      await flushPromises()
      await pickRadio(dialog, 'ps1')
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
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
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-project')
      await flushPromises()
      await pickRadio(dialog, 'ps1')
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
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
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Selecteer een JSON- of PDF-bestand')
      expect(assessmentsCreate).not.toHaveBeenCalled()
    })

    it('imports a DPIA file (detectImportType=dpia) and uses the parsed state directly', async () => {
      detectImportType.mockReturnValue('dpia')
      const parsed = { answers: { '1.1': { value: 'a' } }, metadata: {} }
      parseAndValidateImport.mockReturnValue(parsed)
      assessmentsCreate.mockResolvedValue({ id: 'dpia-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()

      const file = new File([JSON.stringify({ answers: { '1.1': { value: 'a' } } })], 'dpia.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()

      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'dpia', undefined, parsed)
      expect(routerPush).toHaveBeenCalledWith('/assessment/dpia-import')
    })

    it('imports a pre-scan file (detectImportType=prescan) and wraps it as _prescanAnswers', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({ answers: { '0.1': { value: 'p' } } })
      assessmentsCreate.mockResolvedValue({ id: 'dpia-from-import-ps' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()

      const file = new File([JSON.stringify({ answers: { '0.1': { value: 'p' } } })], 'ps.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()

      await findButton(dialog, 'Start DPIA')!.trigger('click')
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
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Ongeldig bestand')
    })

    it('falls back to a default message when the thrown error has no message', async () => {
      assessmentsCreate.mockRejectedValue({})
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Er is iets misgegaan')
    })
  })

  describe('submitPrescanDialog branches', () => {
    it('creates an empty pre-scan and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'ps-new' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'prescan')
      expect(routerPush).toHaveBeenCalledWith('/assessment/ps-new')
    })

    it('errors when prescan upload chosen without a file', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-json-upload')
      await flushPromises()
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Selecteer een JSON- of PDF-bestand')
    })

    it('errors when the uploaded pre-scan file has no answers', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({ answers: {} })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-json-upload')
      await flushPromises()
      const file = new File(['{}'], 'ps.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Het bestand bevat geen pre-scan antwoorden')
    })

    it('errors when the uploaded pre-scan file has a missing answers field', async () => {
      detectImportType.mockReturnValue('prescan')
      parseAndValidateImport.mockReturnValue({})
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-json-upload')
      await flushPromises()
      const file = new File(['{}'], 'ps.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Het bestand bevat geen pre-scan antwoorden')
    })

    it('creates a pre-scan from a valid uploaded file', async () => {
      detectImportType.mockReturnValue('prescan')
      const state = { answers: { '0.1': { value: 'inhoud' } } }
      parseAndValidateImport.mockReturnValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'ps-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-json-upload')
      await flushPromises()
      const file = new File([JSON.stringify(state)], 'ps.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'prescan', undefined, state)
      expect(routerPush).toHaveBeenCalledWith('/assessment/ps-import')
    })
  })

  describe('onFileChange empty branch', () => {
    it('sets uploadFile to null when the field is cleared (files[0] ?? null)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'prescan-json-upload')
      await flushPromises()
      const fileField = dialog.find('nldd-file-field')
      // A bare change event without detail lands in the no-files branch.
      await fileField.trigger('change')
      await flushPromises()
      await findButton(dialog, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Selecteer een JSON- of PDF-bestand')
    })
  })

  describe('dialog submit-button label + disabled state', () => {
    it('shows "Bezig..." and disables the actions while submitting, then resolves', async () => {
      let resolveCreate: (v: unknown) => void = () => {}
      assessmentsCreate.mockReturnValue(new Promise((r) => { resolveCreate = r }))
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const busy = findButton(dialog, 'Bezig...')
      expect(busy).toBeDefined()
      expect(busy!.attributes('disabled')).toBeDefined()
      expect(findButton(dialog, 'Annuleer')!.attributes('disabled')).toBeDefined()
      resolveCreate({ id: 'x' })
      await flushPromises()
      expect(findButton(dialog, 'Start DPIA')!.attributes('disabled')).toBeUndefined()
    })
  })

  describe('delete project flow', () => {
    it('disables the destructive delete button until VERWIJDEREN is typed', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner', name: 'Te wissen' }) })
      await openDeleteDialog(wrapper)
      const dialog = wrapper.find('nldd-modal-dialog[data-test="delete-project-dialog"]')
      expect(dialog.attributes('variant')).toBe('alert')
      expect(dialog.attributes('text')).toBe('Weet je zeker dat je dit project wilt verwijderen?')
      const deleteBtn = findButton(dialog, 'Project verwijderen')!
      expect(deleteBtn.attributes('variant')).toBe('destructive')
      expect(deleteBtn.attributes('disabled')).toBeDefined()
      expect(dialog.text()).toContain('Te wissen')
    })

    it('enables and confirms deletion when VERWIJDEREN is typed', async () => {
      projectsDelete.mockResolvedValue(undefined)
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await openDeleteDialog(wrapper)
      const dialog = wrapper.find('nldd-modal-dialog[data-test="delete-project-dialog"]')
      await setField(dialog.find('.confirm-dialog__input'), 'VERWIJDEREN')
      const deleteBtn = findButton(dialog, 'Project verwijderen')!
      expect(deleteBtn.attributes('disabled')).toBeUndefined()
      await deleteBtn.trigger('click')
      await flushPromises()
      expect(projectsDelete).toHaveBeenCalledWith('p1')
      expect(routerPush).toHaveBeenCalledWith('/projecten')
    })

    it('closes the delete modal via Annuleer (hide()) and clears the input', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="delete-project-dialog"]')
      await openDeleteDialog(wrapper)
      const dialog = wrapper.find('nldd-modal-dialog[data-test="delete-project-dialog"]')
      await setField(dialog.find('.confirm-dialog__input'), 'iets')
      await findButton(dialog, 'Annuleer')!.trigger('click')
      await flushPromises()
      expect(modal.hide).toHaveBeenCalledTimes(1)
      expect(dialog.find('.confirm-dialog__input').attributes('value')).toBe('')
    })

    it('clears the input when the delete modal emits close (Esc / backdrop)', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await openDeleteDialog(wrapper)
      const dialog = wrapper.find('nldd-modal-dialog[data-test="delete-project-dialog"]')
      await setField(dialog.find('.confirm-dialog__input'), 'iets')
      dialog.element.dispatchEvent(new CustomEvent('close'))
      await flushPromises()
      expect(dialog.find('.confirm-dialog__input').attributes('value')).toBe('')
    })
  })

  describe('radio change events without a choice', () => {
    it('ignores a change that reports the option was unchecked', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      const radios = () => dialog.findAll('nldd-radio-button')
      const importRadio = radios().find((r) => r.element.getAttribute('value') === 'import')!

      // The outgoing option also fires a change; only the newly checked one counts.
      importRadio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: false } }))
      await nextTick()
      expect(importRadio.attributes('checked')).toBeUndefined()

      wrapper.unmount()
    })
  })

  describe('"empty" radio re-selection (inline v-model update handler)', () => {
    it('re-selects the empty DPIA option after switching to import', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start DPIA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      const radios = () => dialog.findAll('nldd-radio-button')
      radios().find((r) => r.element.getAttribute('value') === 'import')!.element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      const emptyRadio = radios().find((r) => r.element.getAttribute('value') === 'empty')!
      emptyRadio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      expect(emptyRadio.attributes('checked')).toBeDefined()
    })

    it('re-selects the empty pre-scan option after switching to upload', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start pre-scan')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      const radios = () => dialog.findAll('nldd-radio-button')
      radios().find((r) => r.element.getAttribute('value') === 'prescan-json-upload')!.element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      const emptyRadio = radios().find((r) => r.element.getAttribute('value') === 'empty')!
      emptyRadio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      expect(emptyRadio.attributes('checked')).toBeDefined()
    })
  })

  describe('internal helpers reached via the component instance', () => {
    it('formTypeLabel returns "DPIA" for dpia and "Pre-scan" otherwise', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const vm = wrapper.vm as unknown as { formTypeLabel: (t: string) => string }
      expect(vm.formTypeLabel('dpia')).toBe('DPIA')
      expect(vm.formTypeLabel('prescan')).toBe('Pre-scan')
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
    it('opens the IAMA dialog with the IAMA title and start option', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      const modal = stubModal(wrapper, 'nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(modal.show).toHaveBeenCalledTimes(1)
      expect(wrapper.find('nldd-modal-dialog[data-test="start-dialog"]').attributes('text')).toBe('Hoe wil je de IAMA starten?')
      expect(wrapper.text()).toContain('Start een nieuwe IAMA')
    })

    it('creates an empty IAMA and navigates', async () => {
      assessmentsCreate.mockResolvedValue({ id: 'iama-new' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama')
      expect(routerPush).toHaveBeenCalledWith('/assessment/iama-new')
    })

    it('errors when IAMA import is chosen without a file', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Selecteer een JSON- of PDF-bestand')
      expect(assessmentsCreate).not.toHaveBeenCalled()
    })

    it('imports a valid IAMA JSON file and creates the assessment', async () => {
      detectImportType.mockReturnValue('iama')
      const state = { answers: { '1.1': { value: 'a' } }, metadata: {} }
      parseAndValidateImport.mockReturnValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'iama-import' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      const file = new File([JSON.stringify(state)], 'iama.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama', undefined, state)
      expect(routerPush).toHaveBeenCalledWith('/assessment/iama-import')
    })

    it('re-selects the empty IAMA option after switching to import', async () => {
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      const radios = () => dialog.findAll('nldd-radio-button')
      radios().find((r) => r.element.getAttribute('value') === 'import')!.element
        .dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      const emptyRadio = radios().find((r) => r.element.getAttribute('value') === 'empty')!
      emptyRadio.element.dispatchEvent(new CustomEvent('change', { detail: { checked: true } }))
      await nextTick()
      await flushPromises()
      expect(emptyRadio.attributes('checked')).toBeDefined()
    })
  })

  describe('parseUploadedFile PDF branch + assertImportTypeMatches mismatch', () => {
    it('routes a .pdf upload through importFromPdf', async () => {
      detectImportType.mockReturnValue('iama')
      const state = { answers: { '1.1': { value: 'pdf' } }, metadata: {} }
      importFromPdf.mockResolvedValue(state)
      assessmentsCreate.mockResolvedValue({ id: 'iama-pdf' })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      const file = new File(['%PDF-1.4'], 'iama.PDF', { type: 'application/pdf' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(importFromPdf).toHaveBeenCalledWith(file)
      expect(parseAndValidateImport).not.toHaveBeenCalled()
      expect(assessmentsCreate).toHaveBeenCalledWith('p1', 'iama', undefined, state)
    })

    it('rejects an IAMA import whose detected type is a DPIA (mismatch error)', async () => {
      detectImportType.mockReturnValue('dpia')
      parseAndValidateImport.mockReturnValue({ answers: { '1.1': { value: 'x' } } })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Het bestand bevat een DPIA-assessment, maar er werd een IAMA-bestand verwacht.')
    })

    it('rejects an import whose type is undetectable (detected=null → "onbekend")', async () => {
      detectImportType.mockReturnValue(null)
      parseAndValidateImport.mockReturnValue({ answers: {} })
      const wrapper = await mountDetail({ project: makeProject({ role: 'owner' }) })
      await findButton(wrapper, 'Start IAMA')!.trigger('click')
      await flushPromises()
      const dialog = wrapper.find('nldd-modal-dialog[data-test="start-dialog"]')
      await pickRadio(dialog, 'import')
      await flushPromises()
      const file = new File(['{}'], 'x.json', { type: 'application/json' })
      const fileField = dialog.find('nldd-file-field')
      await fileField.trigger('change', { detail: { files: [file] } })
      await flushPromises()
      await findButton(dialog, 'Start IAMA')!.trigger('click')
      await flushPromises()
      expect(assessmentsCreate).not.toHaveBeenCalled()
      expect(dialog.find('nldd-banner[variant="critical"]').attributes('text')).toBe('Het bestand bevat een onbekend-assessment, maar er werd een IAMA-bestand verwacht.')
    })
  })
})

describe('ProjectDetail — load more', () => {
  const mountRaw = async () => {
    const wrapper = mount(ProjectDetail, {
      props: { projectId: 'p1' },
      global: {
        stubs: {
          RouterLink: { template: '<a class="router-link-stub"><slot /></a>' },
        },
      },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  it('shows a load-more button and appends the next page of assessments', async () => {
    projectsGet.mockResolvedValue(makeProject())
    assessmentsList
      .mockResolvedValueOnce({ items: [makeAssessment({ id: 'a1' }), makeAssessment({ id: 'a2' })], total: 3 })
      .mockResolvedValueOnce({ items: [makeAssessment({ id: 'a3' })], total: 3 })
    const wrapper = await mountRaw()
    const more = wrapper.find('nldd-button[slot="footer"]')
    expect(more.exists()).toBe(true)
    expect(more.attributes('text')).toContain('assessments')
    await more.trigger('click')
    await flushPromises()
    expect(wrapper.find('nldd-button[slot="footer"]').exists()).toBe(false)
  })

  it('shows an error when loading more assessments fails', async () => {
    projectsGet.mockResolvedValue(makeProject())
    assessmentsList
      .mockResolvedValueOnce({ items: [makeAssessment({ id: 'a1' }), makeAssessment({ id: 'a2' })], total: 3 })
      .mockRejectedValueOnce(new Error('netwerk'))
    const wrapper = await mountRaw()
    await wrapper.find('nldd-button[slot="footer"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__error').text()).toContain('mislukt')
  })
})

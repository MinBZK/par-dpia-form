/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Project } from '../../src/api'

const listMock = vi.fn()
const createMock = vi.fn()
const { ApiError } = vi.hoisted(() => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock('../../src/api', () => ({
  ApiError,
  projects: {
    list: async (...args: unknown[]) => {
      const r = await listMock(...args)
      return Array.isArray(r) ? { items: r, total: r.length } : r
    },
    create: (...args: unknown[]) => createMock(...args),
  },
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

import ProjectList from '../../src/views/ProjectList.vue'

function mountList() {
  return mount(ProjectList, {
    global: {
      stubs: {
        RouterLink: {
          name: 'RouterLink',
          props: ['to'],
          template: '<a class="router-link" :href="to"><slot /></a>',
        },
      },
    },
  })
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Project Een',
    description: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  }
}

// The nldd-* custom elements are not registered in jsdom, so field values are
// simulated as NLDD CustomEvents carrying detail.value.
function dispatchFieldInput(wrapper: ReturnType<typeof mountList>, selector: string, value: string) {
  wrapper.find(selector).element.dispatchEvent(new CustomEvent('input', { detail: { value } }))
}

async function openCreateForm(wrapper: ReturnType<typeof mountList>) {
  await wrapper.find('nldd-button[text="Nieuw project"]').trigger('click')
}

beforeEach(() => {
  listMock.mockReset()
  createMock.mockReset()
  routerPush.mockReset()
})

describe('ProjectList', () => {
  describe('onMounted load', () => {
    it('shows the loading state before the list resolves', () => {
      // Never-resolving promise keeps loading.value true.
      listMock.mockReturnValue(new Promise<Project[]>(() => {}))
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Projecten laden...')
    })

    it('renders the empty-state message when the API returns no projects', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      expect(wrapper.text()).not.toContain('Projecten laden...')
      expect(wrapper.text()).toContain('Je hebt nog geen projecten. Maak er een aan om te beginnen.')
    })

    it('shows a warning banner when projects.list() rejects (catch branch)', async () => {
      listMock.mockRejectedValue(new Error('network down'))
      const wrapper = mountList()
      await flushPromises()

      const banner = wrapper.find('nldd-banner')
      expect(banner.exists()).toBe(true)
      expect(banner.attributes('variant')).toBe('warning')
      expect(banner.attributes('text')).toBe('Kan projecten niet laden. Probeer het later opnieuw.')
      expect(wrapper.text()).not.toContain('Je hebt nog geen projecten')
    })

    it('shows the server message on a 403 instead of advising a retry', async () => {
      listMock.mockRejectedValue(new ApiError('Je e-mailadres is niet geverifieerd.', 403))
      const wrapper = mountList()
      await flushPromises()

      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.attributes('text')).toBe('Je e-mailadres is niet geverifieerd.')
    })

    it('keeps the generic message for a non-403 ApiError', async () => {
      listMock.mockRejectedValue(new ApiError('Serverfout', 500))
      const wrapper = mountList()
      await flushPromises()

      const banner = wrapper.find('nldd-banner[variant="warning"]')
      expect(banner.attributes('text')).toBe('Kan projecten niet laden. Probeer het later opnieuw.')
    })
  })

  describe('project cards', () => {
    it('renders a card per project in a grid collection with a link to its detail route', async () => {
      listMock.mockResolvedValue([
        makeProject({ id: 'a', name: 'Alpha' }),
        makeProject({ id: 'b', name: 'Beta' }),
      ])
      const wrapper = mountList()
      await flushPromises()

      const grid = wrapper.find('nldd-collection')
      expect(grid.attributes('layout')).toBe('grid')
      expect(grid.attributes('item-width')).toBe('380px')
      expect(grid.attributes('gap')).toBe('16px')
      expect(grid.attributes('max-items')).toBe('2')

      const cards = wrapper.findAll('nldd-collection > nldd-card')
      expect(cards).toHaveLength(2)
      expect(cards[0].attributes('href')).toBe('/project/a')
      expect(cards[1].attributes('href')).toBe('/project/b')
      expect(cards[0].attributes('accessible-label')).toBe('Open project Alpha')
      expect(cards[0].find('nldd-container').exists()).toBe(true)
      expect(wrapper.text()).toContain('Alpha')
      expect(wrapper.text()).toContain('Beta')
    })

    it('renders the description paragraph only when a description is present', async () => {
      listMock.mockResolvedValue([
        makeProject({ id: 'a', name: 'Met', description: 'Een omschrijving' }),
        makeProject({ id: 'b', name: 'Zonder', description: '' }),
      ])
      const wrapper = mountList()
      await flushPromises()

      const cards = wrapper.findAll('nldd-collection > nldd-card')
      expect(cards[0].find('.text-clamp-3').exists()).toBe(true)
      expect(cards[0].find('.text-clamp-3').text()).toBe('Een omschrijving')
      expect(cards[1].find('.text-clamp-3').exists()).toBe(false)
    })
  })

  it('renders the page title as an h1 inside nldd-title', async () => {
    listMock.mockResolvedValue([])
    const wrapper = mountList()
    await flushPromises()

    const title = wrapper.get('nldd-title')
    expect(title.attributes('size')).toBe('3')
    expect(title.get('h1').text()).toBe('Projecten')
  })

  describe('create form toggle', () => {
    it('shows the "Nieuw project" button and hides the form initially', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      expect(wrapper.find('form').exists()).toBe(false)
      const trigger = wrapper.find('nldd-button[text="Nieuw project"]')
      expect(trigger.exists()).toBe(true)
      expect(trigger.attributes('variant')).toBe('primary')
      expect(trigger.attributes('start-icon')).toBe('plus')
    })

    it('reveals the form when the "Nieuw project" button is clicked', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)

      expect(wrapper.find('form').exists()).toBe(true)
      expect(wrapper.find('nldd-button[text="Nieuw project"]').exists()).toBe(false)
    })

    it('hides the form again when "Annuleren" is clicked', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)
      expect(wrapper.find('form').exists()).toBe(true)

      const cancel = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === 'Annuleren')!
      await cancel.trigger('click')
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('labels the fields via nldd-form-field, with the description marked optional', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)

      const fields = wrapper.findAll('nldd-form-field')
      expect(fields).toHaveLength(2)
      const actions = wrapper.get('form nldd-button-group')
      expect(actions.attributes('orientation')).toBe('horizontal')
      expect(actions.findAll('nldd-button').map((b) => b.attributes('text'))).toEqual([
        'Project toevoegen',
        'Annuleren',
      ])
      expect(fields[0].attributes('label')).toBe('Naam')
      expect(fields[0].find('nldd-text-field[input-id="projectName"]').exists()).toBe(true)
      expect(fields[1].attributes('label')).toBe('Beschrijving')
      expect(fields[1].attributes('optional')).toBeDefined()
      const desc = fields[1].find('nldd-multi-line-text-field[input-id="projectDesc"]')
      expect(desc.attributes('resize')).toBe('auto')
      expect(desc.attributes('rows')).toBe('2')
    })
  })

  describe('fieldValue (NLDD field events)', () => {
    it('reads the value from event.detail and mirrors it back into the value binding', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)
      dispatchFieldInput(wrapper, '[input-id="projectName"]', 'Detail naam')
      await flushPromises()

      expect(wrapper.find('[input-id="projectName"]').attributes('value')).toBe('Detail naam')
    })

    it('falls back to target.value when the event carries no detail', async () => {
      listMock.mockResolvedValue([])
      createMock.mockResolvedValue(makeProject({ id: 'f', name: 'Fallback naam' }))
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)
      const host = wrapper.find('[input-id="projectName"]').element as HTMLElement & { value?: string }
      host.value = 'Fallback naam'
      host.dispatchEvent(new CustomEvent('input'))

      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith('Fallback naam', '')
    })
  })

  describe('handleCreate (form submit)', () => {
    it('does nothing when the project name is empty (early return branch)', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)

      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(createMock).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('creates a project and navigates to it when a name is provided', async () => {
      listMock.mockResolvedValue([])
      createMock.mockResolvedValue(makeProject({ id: 'new-id', name: 'Nieuw' }))
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)

      dispatchFieldInput(wrapper, '[input-id="projectName"]', 'Mijn project')
      dispatchFieldInput(wrapper, '[input-id="projectDesc"]', 'Met beschrijving')

      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith('Mijn project', 'Met beschrijving')
      expect(routerPush).toHaveBeenCalledWith('/project/new-id')
    })

    it('creates with an empty description when none is entered', async () => {
      listMock.mockResolvedValue([])
      createMock.mockResolvedValue(makeProject({ id: 'x', name: 'Geen desc' }))
      const wrapper = mountList()
      await flushPromises()

      await openCreateForm(wrapper)
      dispatchFieldInput(wrapper, '[input-id="projectName"]', 'Alleen naam')

      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith('Alleen naam', '')
      expect(routerPush).toHaveBeenCalledWith('/project/x')
    })
  })
})

describe('ProjectList — load more', () => {
  it('shows a load-more button and appends the next page', async () => {
    listMock
      .mockResolvedValueOnce({ items: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], total: 3 })
      .mockResolvedValueOnce({ items: [{ id: 'p3', name: 'C' }], total: 3 })
    const wrapper = mountList()
    await flushPromises()
    const more = wrapper.find('nldd-button[slot="footer"]')
    expect(more.exists()).toBe(true)
    expect(more.attributes('text')).toContain('projecten')
    await more.trigger('click')
    await flushPromises()
    expect(wrapper.find('nldd-button[slot="footer"]').exists()).toBe(false)
  })

  it('shows an error when loading more fails', async () => {
    listMock
      .mockResolvedValueOnce({ items: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], total: 3 })
      .mockRejectedValueOnce(new Error('netwerk'))
    const wrapper = mountList()
    await flushPromises()
    await wrapper.find('nldd-button[slot="footer"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.version-list__error').text()).toContain('mislukt')
  })
})

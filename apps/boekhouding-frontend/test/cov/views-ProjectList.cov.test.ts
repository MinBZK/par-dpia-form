/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Project } from '../../src/api'

const listMock = vi.fn()
const createMock = vi.fn()
vi.mock('../../src/api', () => ({
  projects: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const autoGrowTextarea = vi.fn()
vi.mock('@overheid-assessment/core', () => ({
  UiButton: {
    name: 'UiButton',
    props: ['variant', 'type', 'label'],
    emits: ['click'],
    template:
      '<button :type="type || \'button\'" class="ui-button" :data-variant="variant" @click="$emit(\'click\', $event)">{{ label }}</button>',
  },
  autoGrowTextarea: (...args: unknown[]) => autoGrowTextarea(...args),
}))

import ProjectList from '../../src/views/ProjectList.vue'

const AppHeaderStub = {
  name: 'AppHeader',
  template: '<header class="app-header-stub"><slot name="left" /></header>',
}

function mountList() {
  return mount(ProjectList, {
    global: {
      stubs: {
        AppHeader: AppHeaderStub,
        RouterLink: {
          name: 'RouterLink',
          props: ['to'],
          template: '<a class="router-link" :href="to"><slot /></a>',
        },
        IconPlus: { name: 'IconPlus', template: '<span class="icon-plus" />' },
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

beforeEach(() => {
  listMock.mockReset()
  createMock.mockReset()
  routerPush.mockReset()
  autoGrowTextarea.mockReset()
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

    it('sets the error message when projects.list() rejects (catch branch)', async () => {
      listMock.mockRejectedValue(new Error('network down'))
      const wrapper = mountList()
      await flushPromises()

      const alert = wrapper.find('.rvo-alert.rvo-alert--warning')
      expect(alert.exists()).toBe(true)
      expect(alert.text()).toBe('Kan projecten niet laden. Probeer het later opnieuw.')
      expect(wrapper.text()).not.toContain('Je hebt nog geen projecten')
    })
  })

  describe('project cards', () => {
    it('renders a card per project with a link to its detail route', async () => {
      listMock.mockResolvedValue([
        makeProject({ id: 'a', name: 'Alpha' }),
        makeProject({ id: 'b', name: 'Beta' }),
      ])
      const wrapper = mountList()
      await flushPromises()

      const links = wrapper.findAll('.router-link')
      expect(links).toHaveLength(2)
      expect(links[0].attributes('href')).toBe('/project/a')
      expect(links[1].attributes('href')).toBe('/project/b')
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

      const cards = wrapper.findAll('.router-link')
      expect(cards[0].find('.text-clamp-3').exists()).toBe(true)
      expect(cards[0].find('.text-clamp-3').text()).toBe('Een omschrijving')
      expect(cards[1].find('.text-clamp-3').exists()).toBe(false)
    })
  })

  describe('create form toggle', () => {
    it('shows the "Nieuw project" button and hides the form initially', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      expect(wrapper.find('form').exists()).toBe(false)
      const trigger = wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))
      expect(trigger).toBeTruthy()
    })

    it('reveals the form when the "Nieuw project" button is clicked', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      const trigger = wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!
      await trigger.trigger('click')

      expect(wrapper.find('form').exists()).toBe(true)
      expect(wrapper.findAll('button').some((b) => b.text().includes('Nieuw project'))).toBe(false)
    })

    it('hides the form again when "Annuleren" is clicked', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!.trigger('click')
      expect(wrapper.find('form').exists()).toBe(true)

      const cancel = wrapper.findAll('button').find((b) => b.text() === 'Annuleren')!
      await cancel.trigger('click')
      expect(wrapper.find('form').exists()).toBe(false)
    })
  })

  describe('autoGrowTextarea on description input', () => {
    it('calls autoGrowTextarea with the textarea element on input', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!.trigger('click')

      const textarea = wrapper.find('#projectDesc')
      await textarea.setValue('lange beschrijving')
      await textarea.trigger('input')

      expect(autoGrowTextarea).toHaveBeenCalled()
      expect(autoGrowTextarea.mock.calls[0][0]).toBe(textarea.element)
    })
  })

  describe('handleCreate (form submit)', () => {
    it('does nothing when the project name is empty (early return branch)', async () => {
      listMock.mockResolvedValue([])
      const wrapper = mountList()
      await flushPromises()

      await wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!.trigger('click')

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

      await wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!.trigger('click')

      await wrapper.find('#projectName').setValue('Mijn project')
      await wrapper.find('#projectDesc').setValue('Met beschrijving')

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

      await wrapper.findAll('button').find((b) => b.text().includes('Nieuw project'))!.trigger('click')
      await wrapper.find('#projectName').setValue('Alleen naam')

      await wrapper.find('form').trigger('submit.prevent')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith('Alleen naam', '')
      expect(routerPush).toHaveBeenCalledWith('/project/x')
    })
  })
})

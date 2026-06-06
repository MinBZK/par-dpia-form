/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

// Router mock — useRouter() returns a push spy so we can assert the
// authenticated branch of goToProjects() navigates to /projecten.
const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

// useAuth mock — a controllable authenticated ref drives both the
// goToProjects() branches and the v-if/label template branches. login()
// is a spy so we can assert it is awaited on the unauthenticated branch.
const authenticated = ref(false)
const login = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: computed(() => authenticated.value),
    login,
  }),
}))

// config mock — supplies the standaloneUrl read at <script setup> time.
vi.mock('../../src/config', () => ({
  getConfig: () => ({
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'test-realm',
    keycloakClientId: 'test-client',
    standaloneUrl: '/invulhulpen/',
  }),
}))

// Stub AppHeader so the landing page renders in isolation; the header has
// its own dedicated coverage test.
import LandingPage from '../../src/views/LandingPage.vue'

const mountPage = () =>
  mount(LandingPage, {
    global: {
      stubs: {
        AppHeader: { template: '<header class="app-header-stub" />' },
      },
    },
  })

beforeEach(() => {
  routerPush.mockClear()
  login.mockClear()
  authenticated.value = false
})

describe('LandingPage', () => {
  describe('standaloneUrl from getConfig()', () => {
    it('renders the standalone link with the configured href', () => {
      const wrapper = mountPage()
      const link = wrapper.find('a.utrecht-button')
      expect(link.exists()).toBe(true)
      expect(link.attributes('href')).toBe('/invulhulpen/')
      expect(link.text()).toBe('Start zonder account')
    })

    it('renders the page heading', () => {
      const wrapper = mountPage()
      expect(wrapper.find('h1').text()).toBe('Assessment Boekhouding')
    })
  })

  describe('Samenwerken text (v-if="isAuthenticated")', () => {
    it('shows the unauthenticated copy when not logged in', () => {
      authenticated.value = false
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Log in om samen met collega')
      expect(text).not.toContain('Ga naar je projecten')
    })

    it('shows the authenticated copy when logged in', () => {
      authenticated.value = true
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Ga naar je projecten')
      expect(text).not.toContain('Log in om samen met collega')
    })
  })

  describe('button label (isAuthenticated ? \'Naar projecten\' : \'Inloggen\')', () => {
    it('labels the button "Inloggen" when not authenticated', () => {
      authenticated.value = false
      const wrapper = mountPage()
      expect(wrapper.find('button.utrecht-button').text()).toBe('Inloggen')
    })

    it('labels the button "Naar projecten" when authenticated', () => {
      authenticated.value = true
      const wrapper = mountPage()
      expect(wrapper.find('button.utrecht-button').text()).toBe('Naar projecten')
    })
  })

  describe('goToProjects() click handler', () => {
    it('navigates to /projecten when authenticated and does not call login', async () => {
      authenticated.value = true
      const wrapper = mountPage()
      await wrapper.find('button.utrecht-button').trigger('click')
      await flushPromises()
      expect(routerPush).toHaveBeenCalledWith('/projecten')
      expect(login).not.toHaveBeenCalled()
    })

    it('awaits login() when not authenticated and does not navigate', async () => {
      authenticated.value = false
      const wrapper = mountPage()
      await wrapper.find('button.utrecht-button').trigger('click')
      await flushPromises()
      expect(login).toHaveBeenCalledTimes(1)
      expect(routerPush).not.toHaveBeenCalled()
    })
  })
})

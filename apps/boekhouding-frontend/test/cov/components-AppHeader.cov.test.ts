/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'

// Router mock — useRouter() returns push/back spies so we can assert
// which navigation branch the back button takes.
const routerPush = vi.fn()
const routerBack = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, back: routerBack }),
}))

// useAuth mock — controllable refs so we can drive the isAuthenticated and
// user template branches, and assert the logout handler is wired up.
const user = ref<{ id: string; email: string; displayName: string } | null>(null)
const authenticated = ref(false)
const logout = vi.fn()
vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    user,
    isAuthenticated: computed(() => authenticated.value),
    logout,
  }),
}))

import AppHeader from '../../src/components/AppHeader.vue'

beforeEach(() => {
  routerPush.mockClear()
  routerBack.mockClear()
  logout.mockClear()
  user.value = null
  authenticated.value = false
})

describe('AppHeader', () => {
  describe('back button rendering (v-if="backRoute || showBack")', () => {
    it('does not render the back button when neither backRoute nor showBack is set', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.find('.app-header__back').exists()).toBe(false)
    })

    it('renders the back button when only backRoute is set', () => {
      const wrapper = mount(AppHeader, { props: { backRoute: '/projecten' } })
      expect(wrapper.find('.app-header__back').exists()).toBe(true)
    })

    it('renders the back button when only showBack is true', () => {
      const wrapper = mount(AppHeader, { props: { showBack: true } })
      expect(wrapper.find('.app-header__back').exists()).toBe(true)
    })
  })

  describe('back button label (backLabel || \'Terug\')', () => {
    it('falls back to the default Dutch label "Terug" when no backLabel given', () => {
      const wrapper = mount(AppHeader, { props: { showBack: true } })
      expect(wrapper.find('.app-header__back').text()).toContain('Terug')
    })

    it('uses the supplied backLabel when provided', () => {
      const wrapper = mount(AppHeader, {
        props: { showBack: true, backLabel: 'Vorige' },
      })
      const text = wrapper.find('.app-header__back').text()
      expect(text).toContain('Vorige')
      expect(text).not.toContain('Terug')
    })
  })

  describe('back button click handler (backRoute ? router.push : router.back)', () => {
    it('calls router.push with backRoute when backRoute is set', async () => {
      const wrapper = mount(AppHeader, { props: { backRoute: '/projecten' } })
      await wrapper.find('.app-header__back').trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/projecten')
      expect(routerBack).not.toHaveBeenCalled()
    })

    it('calls router.back when only showBack is set (no backRoute)', async () => {
      const wrapper = mount(AppHeader, { props: { showBack: true } })
      await wrapper.find('.app-header__back').trigger('click')
      expect(routerBack).toHaveBeenCalledTimes(1)
      expect(routerPush).not.toHaveBeenCalled()
    })
  })

  describe('authenticated block (v-if="isAuthenticated")', () => {
    it('renders neither user name nor logout button when not authenticated', () => {
      const wrapper = mount(AppHeader)
      expect(wrapper.find('.app-header__user').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Uitloggen')
    })

    it('renders the logout button when authenticated', () => {
      authenticated.value = true
      const wrapper = mount(AppHeader)
      expect(wrapper.text()).toContain('Uitloggen')
    })
  })

  describe('user name (v-if="user")', () => {
    it('does not render the user span when authenticated but user is null', () => {
      authenticated.value = true
      user.value = null
      const wrapper = mount(AppHeader)
      expect(wrapper.find('.app-header__user').exists()).toBe(false)
      // Logout button still present in the authenticated block.
      expect(wrapper.text()).toContain('Uitloggen')
    })

    it('renders the user displayName when authenticated and user is set', () => {
      authenticated.value = true
      user.value = { id: 'u1', email: 'sam@example.com', displayName: 'Sam van der Berg' }
      const wrapper = mount(AppHeader)
      const span = wrapper.find('.app-header__user')
      expect(span.exists()).toBe(true)
      expect(span.text()).toBe('Sam van der Berg')
    })
  })

  describe('logout handler', () => {
    it('calls logout when the logout button is clicked', async () => {
      authenticated.value = true
      const wrapper = mount(AppHeader)
      const buttons = wrapper.findAll('button')
      const logoutButton = buttons.find((b) => b.text().includes('Uitloggen'))!
      await logoutButton.trigger('click')
      expect(logout).toHaveBeenCalledTimes(1)
    })
  })

  describe('slots', () => {
    it('renders left and right slot content', () => {
      const wrapper = mount(AppHeader, {
        slots: {
          left: '<span class="slot-left">L</span>',
          right: '<span class="slot-right">R</span>',
        },
      })
      expect(wrapper.find('.slot-left').exists()).toBe(true)
      expect(wrapper.find('.slot-right').exists()).toBe(true)
    })
  })
})

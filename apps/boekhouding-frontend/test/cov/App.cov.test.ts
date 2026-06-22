/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const isAuthenticated = ref(false)

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated,
    sessionExpired: ref(false),
    relogin: vi.fn(),
  }),
}))

vi.mock('@overheid-assessment/core', () => ({
  AppBanner: {
    name: 'AppBanner',
    props: ['message', 'title', 'homeUrl'],
    template: '<div class="app-banner-stub" :data-home-url="homeUrl" :data-message="message" />',
  },
}))

let App: typeof import('../../src/App.vue').default

beforeEach(async () => {
  vi.resetModules()
  isAuthenticated.value = false
  App = (await import('../../src/App.vue')).default
})

function mountApp() {
  return mount(App, {
    global: {
      mocks: {
        $route: { path: '/projecten' },
      },
      stubs: {
        SessionExpiredDialog: { template: '<div class="session-expired-stub" />' },
        'router-view': { template: '<div class="router-view-stub" />' },
        'router-link': {
          props: ['to'],
          template: '<a class="router-link-stub" :href="to"><slot /></a>',
        },
      },
    },
  })
}

describe('App.vue', () => {
  it('renders the layout with banner, router-view, dialog and footer links', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.app-layout').exists()).toBe(true)
    expect(wrapper.find('.app-banner-stub').exists()).toBe(true)
    expect(wrapper.find('.router-view-stub').exists()).toBe(true)
    expect(wrapper.find('.session-expired-stub').exists()).toBe(true)

    const footerLinks = wrapper.findAll('.app-footer__link')
    expect(footerLinks).toHaveLength(5)
    expect(footerLinks.map((l) => l.text())).toEqual([
      'Privacyverklaring',
      'Toegankelijkheid',
      'Over Invulhulpen',
      'Modelversies',
      'Status',
    ])
    expect(footerLinks.map((l) => l.attributes('href'))).toEqual([
      '/privacy',
      '/toegankelijkheid',
      '/over',
      '/modellen',
      '/status',
    ])
  })

  it('homeUrl is "/" when the user is not authenticated', () => {
    isAuthenticated.value = false
    const wrapper = mountApp()

    expect(wrapper.find('.app-banner-stub').attributes('data-home-url')).toBe('/')
  })

  it('homeUrl is "/projecten" when the user is authenticated', () => {
    isAuthenticated.value = true
    const wrapper = mountApp()

    expect(wrapper.find('.app-banner-stub').attributes('data-home-url')).toBe('/projecten')
  })
})

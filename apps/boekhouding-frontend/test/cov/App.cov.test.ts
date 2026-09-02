/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'

const isAuthenticated = ref(false)
const user = ref<{ id: string; email: string; displayName: string } | null>(null)
const login = vi.fn()
const logout = vi.fn()

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated,
    user,
    login,
    logout,
    sessionExpired: ref(false),
    relogin: vi.fn(),
  }),
}))

const route = reactive({ path: '/projecten' })
const routerPush = vi.fn()
const routerBack = vi.fn()
const routerAfterEach = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: routerPush, back: routerBack, afterEach: routerAfterEach }),
}))

vi.mock('@overheid-assessment/core', () => ({
  AppBanner: {
    name: 'AppBanner',
    props: ['message', 'title', 'homeUrl', 'backText'],
    emits: ['back'],
    // Renders the slots so the header menus are part of the mounted tree.
    template:
      '<div class="app-banner-stub" :data-home-url="homeUrl" :data-message="message" ' +
      ':data-back-text="backText" @click="$emit(\'back\')">' +
      '<slot name="global" /><slot name="utility" /></div>',
  },
  ThemeMenuItems: {
    name: 'ThemeMenuItems',
    template: '<div class="theme-menu-items-stub" />',
  },
  useTheme: vi.fn(() => ({ theme: ref('auto'), setTheme: vi.fn() })),
}))

let App: typeof import('../../src/App.vue').default

beforeEach(async () => {
  vi.resetModules()
  isAuthenticated.value = false
  user.value = null
  route.path = '/projecten'
  login.mockClear()
  logout.mockClear()
  routerPush.mockClear()
  routerBack.mockClear()
  routerAfterEach.mockClear()
  App = (await import('../../src/App.vue')).default
})

function mountApp() {
  return mount(App, {
    global: {
      mocks: {
        $route: route,
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

function menuBarItem(wrapper: ReturnType<typeof mountApp>, text: string) {
  return wrapper.findAll('nldd-menu-bar-item').find((i) => i.attributes('text') === text)
}

describe('App.vue', () => {
  it('renders the layout with banner, router-view, dialog and footer links', () => {
    const wrapper = mountApp()

    expect(wrapper.find('nldd-app-view').exists()).toBe(true)
    expect(wrapper.find('nldd-page').exists()).toBe(true)
    expect(wrapper.find('[slot="header"]').exists()).toBe(true)
    expect(wrapper.find('.app-banner-stub').exists()).toBe(true)
    expect(wrapper.find('.router-view-stub').exists()).toBe(true)
    expect(wrapper.find('.session-expired-stub').exists()).toBe(true)

    const skipLink = wrapper.find('nldd-skip-link')
    expect(skipLink.attributes('text')).toBe('Naar hoofdinhoud')
    expect(skipLink.attributes('href')).toBe('#main-content')
    expect(wrapper.find('main#main-content').attributes('tabindex')).toBe('-1')
    expect(wrapper.find('nldd-page-footer').exists()).toBe(true)

    // start: who runs this, without a link. end: the four legal links.
    const owner = wrapper.find('nldd-page-footer-legal-bar-item[slot="start"]')
    expect(owner.attributes('text')).toBe('Ministerie van Binnenlandse Zaken en Koninkrijksrelaties')
    expect(owner.attributes('href')).toBeUndefined()

    const footerItems = wrapper.findAll('nldd-page-footer-legal-bar-item[slot="end"]')
    expect(footerItems).toHaveLength(4)
    expect(footerItems.map((l) => l.attributes('text'))).toEqual([
      'Privacyverklaring',
      'Toegankelijkheid',
      'Over Invulhulpen',
      'Status',
    ])
    expect(footerItems.map((l) => l.attributes('href'))).toEqual([
      '/privacy',
      '/toegankelijkheid',
      '/over',
      '/status',
    ])
    expect(footerItems.every((l) => l.attributes('slot') === 'end')).toBe(true)
  })

  describe('back link in the top bar', () => {
    it('passes the declared back link to the banner and pushes its route on back', async () => {
      const wrapper = mountApp()
      const { useBackLink } = await import('../../src/composables/useBackLink')
      useBackLink().set({ text: 'Terug naar projecten', to: '/projecten' })
      await wrapper.vm.$nextTick()

      const banner = wrapper.find('.app-banner-stub')
      expect(banner.attributes('data-back-text')).toBe('Terug naar projecten')

      await banner.trigger('click')
      expect(routerPush).toHaveBeenCalledWith('/projecten')
    })

    it('walks the browser history when the back link has no route', async () => {
      const wrapper = mountApp()
      const { useBackLink } = await import('../../src/composables/useBackLink')
      useBackLink().set({ text: 'Terug' })
      await wrapper.vm.$nextTick()

      await wrapper.find('.app-banner-stub').trigger('click')
      expect(routerBack).toHaveBeenCalledTimes(1)
    })

    it('ignores back without a declared link and clears the link on route change', async () => {
      const wrapper = mountApp()
      const { useBackLink } = await import('../../src/composables/useBackLink')
      useBackLink().set(null)
      await wrapper.vm.$nextTick()

      await wrapper.find('.app-banner-stub').trigger('click')
      expect(routerPush).not.toHaveBeenCalled()
      expect(routerBack).not.toHaveBeenCalled()

      // App registers an afterEach hook that clears the link between routes.
      useBackLink().set({ text: 'Terug' })
      const afterEach = routerAfterEach.mock.calls.at(-1)![0] as () => void
      afterEach()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.app-banner-stub').attributes('data-back-text')).toBeUndefined()
    })
  })

  describe('footer navigation interception', () => {
    // The real anchors sit in the legal-bar items' shadow roots; in jsdom we
    // append a light-DOM anchor so the composed click path contains one.
    function clickAnchor(
      wrapper: ReturnType<typeof mountApp>,
      href: string,
      init: MouseEventInit = {},
    ) {
      const bar = wrapper.find('nldd-page-footer-legal-bar').element
      const anchor = document.createElement('a')
      anchor.href = href
      bar.appendChild(anchor)
      const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init })
      anchor.dispatchEvent(event)
      anchor.remove()
      return event
    }

    it('routes a plain same-origin click through the router', () => {
      const wrapper = mountApp()
      const event = clickAnchor(wrapper, `${window.location.origin}/privacy`)

      expect(routerPush).toHaveBeenCalledWith('/privacy')
      expect(event.defaultPrevented).toBe(true)
    })

    it('leaves modified clicks, non-primary buttons and external links alone', () => {
      const wrapper = mountApp()

      clickAnchor(wrapper, `${window.location.origin}/privacy`, { metaKey: true })
      clickAnchor(wrapper, `${window.location.origin}/privacy`, { ctrlKey: true })
      clickAnchor(wrapper, `${window.location.origin}/privacy`, { shiftKey: true })
      clickAnchor(wrapper, `${window.location.origin}/privacy`, { altKey: true })
      clickAnchor(wrapper, `${window.location.origin}/privacy`, { button: 1 })
      clickAnchor(wrapper, 'https://example.test/elders')

      // A click without an anchor in its path is ignored too.
      const bar = wrapper.find('nldd-page-footer-legal-bar').element
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // And a click something else already handled stays untouched.
      const handled = clickAnchorWithPreventedDefault(wrapper)
      expect(handled.defaultPrevented).toBe(true)

      expect(routerPush).not.toHaveBeenCalled()
    })

    function clickAnchorWithPreventedDefault(wrapper: ReturnType<typeof mountApp>) {
      const bar = wrapper.find('nldd-page-footer-legal-bar').element
      const anchor = document.createElement('a')
      anchor.href = `${window.location.origin}/privacy`
      anchor.addEventListener('click', (e) => e.preventDefault(), { once: true })
      bar.appendChild(anchor)
      const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true })
      anchor.dispatchEvent(event)
      anchor.remove()
      return event
    }
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

  describe('header menus', () => {
    it('shows only the Inloggen item when not authenticated, and it calls login()', async () => {
      const wrapper = mountApp()

      expect(wrapper.find('nldd-menu-bar[accessible-label="Hoofdmenu"]').exists()).toBe(false)
      const inloggen = menuBarItem(wrapper, 'Inloggen')
      expect(inloggen).toBeDefined()
      expect(inloggen!.attributes('icon')).toBe('login')

      await inloggen!.trigger('select')
      expect(login).toHaveBeenCalledTimes(1)
    })

    it('leaves the global slot empty: the logo already links home', () => {
      isAuthenticated.value = true
      const wrapper = mountApp()
      expect(menuBarItem(wrapper, 'Projecten')).toBeUndefined()
      expect(wrapper.findAll('nldd-menu-bar')).toHaveLength(1)
    })

    it('shows the account menu with the display name and logs out via the menu item', async () => {
      isAuthenticated.value = true
      user.value = { id: 'u1', email: 'sam@example.com', displayName: 'Sam van der Berg' }
      const wrapper = mountApp()

      const account = menuBarItem(wrapper, 'Sam van der Berg')
      expect(account).toBeDefined()
      expect(account!.attributes('icon')).toBe('user')
      expect(account!.attributes('expandable')).toBe('')
      expect(menuBarItem(wrapper, 'Inloggen')).toBeUndefined()

      const uitloggen = wrapper.find('nldd-menu-item[text="Uitloggen"]')
      expect(uitloggen.exists()).toBe(true)
      await uitloggen.trigger('select')
      expect(logout).toHaveBeenCalledTimes(1)

      // The account menu carries the theme choice as a labeled group.
      const group = wrapper.find('nldd-menu nldd-menu-group')
      expect(group.attributes('text')).toBe('Weergave')
      expect(group.find('.theme-menu-items-stub').exists()).toBe(true)
    })

    it('falls back to "Account" as display name when the user profile is not loaded', () => {
      isAuthenticated.value = true
      user.value = null
      const wrapper = mountApp()

      expect(menuBarItem(wrapper, 'Account')).toBeDefined()
    })
  })
})

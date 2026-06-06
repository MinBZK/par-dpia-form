/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import PrivacyStatement from '../../src/views/PrivacyStatement.vue'

// AppHeader pulls in vue-router + useAuth + icon dependencies that are
// irrelevant to PrivacyStatement's own logic. Stub it with a marker template
// that re-exposes the props PrivacyStatement binds, so we can assert which
// branch of each ternary was taken without mounting the real header.
const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute', 'showBack'],
  template:
    '<header class="app-header-stub" ' +
    ':data-back-label="backLabel" ' +
    ':data-back-route="backRoute === undefined ? \'__undefined__\' : backRoute" ' +
    ':data-show-back="String(showBack)"></header>',
}

function mountStatement() {
  return mount(PrivacyStatement, {
    global: { stubs: { AppHeader: AppHeaderStub } },
  })
}

// Restore a clean history state between tests so each case controls the
// `window.history.state?.back` branch in isolation.
afterEach(() => {
  window.history.replaceState(null, '', window.location.href)
})

describe('PrivacyStatement', () => {
  describe('hasHistory computed (window.history.state?.back)', () => {
    it('is falsy when history.state is null (optional chaining short-circuits)', () => {
      window.history.replaceState(null, '', window.location.href)

      const wrapper = mountStatement()
      const header = wrapper.find('.app-header-stub')

      // hasHistory === false → backLabel "Ga naar home", backRoute "/", showBack false
      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is falsy when history.state exists but has no back entry', () => {
      window.history.replaceState({ other: 'value' }, '', window.location.href)

      const wrapper = mountStatement()
      const header = wrapper.find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is truthy when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      const wrapper = mountStatement()
      const header = wrapper.find('.app-header-stub')

      // hasHistory === true → backLabel "Terug", backRoute undefined, showBack true
      expect(header.attributes('data-back-label')).toBe('Terug')
      expect(header.attributes('data-back-route')).toBe('__undefined__')
      expect(header.attributes('data-show-back')).toBe('true')
    })
  })

  describe('static privacy content', () => {
    it('renders the page heading and contact e-mail', () => {
      window.history.replaceState({ back: '/' }, '', window.location.href)

      const wrapper = mountStatement()

      expect(wrapper.find('h1.utrecht-heading-1').text()).toBe('Privacyverklaring')
      expect(wrapper.text()).toContain('Ministerie van Binnenlandse Zaken en Koninkrijksrelaties')

      const mailto = wrapper
        .findAll('a')
        .find((a) => a.attributes('href') === 'mailto:RIG@rijksoverheid.nl')
      expect(mailto).toBeTruthy()
    })
  })
})

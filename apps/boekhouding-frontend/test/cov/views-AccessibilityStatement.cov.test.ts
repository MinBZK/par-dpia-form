/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import AccessibilityStatement from '../../src/views/AccessibilityStatement.vue'

// Stub AppHeader to capture its props without pulling in vue-router or useAuth.
const AppHeaderStub = defineComponent({
  name: 'AppHeader',
  props: {
    backLabel: { type: String, default: undefined },
    backRoute: { type: String, default: undefined },
    showBack: { type: Boolean, default: false },
  },
  template: '<header class="app-header-stub" />',
})

function mountWith() {
  return mount(AccessibilityStatement, {
    global: {
      stubs: { AppHeader: AppHeaderStub },
    },
  })
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.href)
})

describe('AccessibilityStatement', () => {
  describe('hasHistory computed (window.history.state?.back)', () => {
    it('treats a present history.state.back as having history (truthy branch)', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      const wrapper = mountWith()
      const header = wrapper.findComponent(AppHeaderStub)

      expect(header.props('showBack')).toBe(true)
      expect(header.props('backLabel')).toBe('Terug')
      expect(header.props('backRoute')).toBeUndefined()
    })

    it('treats history.state without a back entry as no history (state present, back falsy)', () => {
      window.history.replaceState({ forward: '/projecten' }, '', window.location.href)

      const wrapper = mountWith()
      const header = wrapper.findComponent(AppHeaderStub)

      expect(header.props('showBack')).toBe(false)
      expect(header.props('backLabel')).toBe('Ga naar home')
      expect(header.props('backRoute')).toBe('/')
    })

    it('treats null history.state as no history (optional-chaining short-circuit)', () => {
      window.history.replaceState(null, '', window.location.href)

      const wrapper = mountWith()
      const header = wrapper.findComponent(AppHeaderStub)

      expect(header.props('showBack')).toBe(false)
      expect(header.props('backLabel')).toBe('Ga naar home')
      expect(header.props('backRoute')).toBe('/')
    })
  })

  describe('static content', () => {
    it('renders the Dutch page heading and key sections', () => {
      window.history.replaceState(null, '', window.location.href)

      const wrapper = mountWith()
      const text = wrapper.text()

      expect(wrapper.find('h1.utrecht-heading-1').text()).toBe('Toegankelijkheidsverklaring')
      expect(text).toContain('Nalevingsstatus')
      expect(text).toContain('Bekende beperkingen')
      expect(text).toContain('Feedback en contact')
      expect(text).toContain('Escalatie')
      expect(text).toContain('Deze verklaring is opgesteld op 15 maart 2026.')

      const mailto = wrapper.find('a[href="mailto:RIG@rijksoverheid.nl"]')
      expect(mailto.exists()).toBe(true)
    })
  })
})

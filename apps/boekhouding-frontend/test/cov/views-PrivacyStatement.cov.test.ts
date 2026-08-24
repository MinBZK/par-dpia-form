/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import PrivacyStatement from '../../src/views/PrivacyStatement.vue'
import { useBackLink } from '../../src/composables/useBackLink'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  window.history.replaceState(null, '', window.location.href)
})

describe('PrivacyStatement', () => {
  describe('back link (window.history.state?.back)', () => {
    it('sets "Ga naar home" towards / when history.state is null (optional chaining short-circuits)', () => {
      window.history.replaceState(null, '', window.location.href)

      mount(PrivacyStatement)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Ga naar home" when history.state exists but has no back entry', () => {
      window.history.replaceState({ other: 'value' }, '', window.location.href)

      mount(PrivacyStatement)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Terug" without a target route when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      mount(PrivacyStatement)

      expect(backLink.value).toEqual({ text: 'Terug' })
    })
  })

  describe('static privacy content', () => {
    it('renders the page heading and contact e-mail', () => {
      const wrapper = mount(PrivacyStatement)

      expect(wrapper.find('h1').text()).toBe('Privacyverklaring')
      expect(wrapper.text()).toContain('Ministerie van Binnenlandse Zaken en Koninkrijksrelaties')

      const mailto = wrapper
        .findAll('a')
        .find((a) => a.attributes('href') === 'mailto:digigilde@rijksoverheid.nl')
      expect(mailto).toBeTruthy()
    })
  })
})

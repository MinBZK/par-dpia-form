/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import PrivacyStatement from '../../src/views/PrivacyStatement.vue'
import { useBackLink } from '../../src/composables/useBackLink'
import { previousPage } from '../../src/router'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  previousPage.value = null
  window.history.replaceState(null, '', window.location.href)
})

describe('PrivacyStatement', () => {
  describe('back link', () => {
    it('names the page the reader came from', () => {
      previousPage.value = { text: 'Projecten', to: '/projecten' }

      mount(PrivacyStatement)

      expect(backLink.value).toEqual({ text: 'Projecten', to: '/projecten' })
    })

    it('falls back to the start page when there is no previous page', () => {
      previousPage.value = null

      mount(PrivacyStatement)

      expect(backLink.value).toEqual({ text: 'Startpagina', to: '/' })
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

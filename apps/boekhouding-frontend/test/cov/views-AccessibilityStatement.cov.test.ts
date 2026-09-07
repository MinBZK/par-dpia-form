/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AccessibilityStatement from '../../src/views/AccessibilityStatement.vue'
import { useBackLink } from '../../src/composables/useBackLink'
import { previousPage } from '../../src/router'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  previousPage.value = null
  window.history.replaceState(null, '', window.location.href)
})

describe('AccessibilityStatement', () => {
  describe('back link', () => {
    it('names the page the reader came from', () => {
      previousPage.value = { text: 'Projecten', to: '/projecten' }

      mount(AccessibilityStatement)

      expect(backLink.value).toEqual({ text: 'Projecten', to: '/projecten' })
    })

    it('falls back to the start page when there is no previous page', () => {
      previousPage.value = null

      mount(AccessibilityStatement)

      expect(backLink.value).toEqual({ text: 'Startpagina', to: '/' })
    })
  })

  describe('static content', () => {
    it('renders the Dutch page heading and key sections', () => {
      const wrapper = mount(AccessibilityStatement)
      const text = wrapper.text()

      expect(wrapper.find('h1').text()).toBe('Toegankelijkheidsverklaring')
      expect(text).toContain('Nalevingsstatus')
      expect(text).toContain('Bekende beperkingen')
      expect(text).toContain('Feedback en contact')
      expect(text).toContain('Escalatie')
      expect(text).toContain('Deze verklaring is opgesteld op 15 maart 2026.')
      expect(text).toContain(
        'De interface is gebouwd met de webcomponenten van het NLDD Design System van de ' +
          'Nederlandse Digitale Dienst (Rijksoverheid), waarin toegankelijkheidseisen zijn ingebouwd',
      )

      const mailto = wrapper.find('a[href="mailto:digigilde@rijksoverheid.nl"]')
      expect(mailto.exists()).toBe(true)
    })
  })
})

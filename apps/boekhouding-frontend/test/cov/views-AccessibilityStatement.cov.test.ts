/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AccessibilityStatement from '../../src/views/AccessibilityStatement.vue'
import { useBackLink } from '../../src/composables/useBackLink'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  window.history.replaceState(null, '', window.location.href)
})

describe('AccessibilityStatement', () => {
  describe('back link (window.history.state?.back)', () => {
    it('sets "Terug" without a target route when history.state.back is set (truthy branch)', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      mount(AccessibilityStatement)

      expect(backLink.value).toEqual({ text: 'Terug' })
    })

    it('sets "Ga naar home" towards / when history.state has no back entry (state present, back falsy)', () => {
      window.history.replaceState({ forward: '/projecten' }, '', window.location.href)

      mount(AccessibilityStatement)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Ga naar home" when history.state is null (optional-chaining short-circuit)', () => {
      window.history.replaceState(null, '', window.location.href)

      mount(AccessibilityStatement)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
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

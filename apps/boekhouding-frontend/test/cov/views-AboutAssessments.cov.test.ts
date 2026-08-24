/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AboutAssessments from '../../src/views/AboutAssessments.vue'
import { useBackLink } from '../../src/composables/useBackLink'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  window.history.replaceState(null, '', window.location.href)
})

describe('AboutAssessments', () => {
  describe('back link (window.history.state?.back)', () => {
    it('sets "Ga naar home" towards / when history.state is null (optional chaining short-circuits)', () => {
      window.history.replaceState(null, '', window.location.href)

      mount(AboutAssessments)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Ga naar home" when history.state exists but has no back entry', () => {
      window.history.replaceState({ other: 'value' }, '', window.location.href)

      mount(AboutAssessments)

      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Terug" without a target route when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      mount(AboutAssessments)

      expect(backLink.value).toEqual({ text: 'Terug' })
    })
  })

  describe('static informational content', () => {
    it('renders the page heading', () => {
      const wrapper = mount(AboutAssessments)

      expect(wrapper.find('h1').text()).toBe('Over Invulhulpen')
    })

    it('renders the key section headings explaining pre-scan, DPIA and IAMA', () => {
      const wrapper = mount(AboutAssessments)
      const text = wrapper.text()

      expect(text).toContain('Pre-scan')
      expect(text).toContain('DPIA')
      expect(text).toContain('Wanneer voer je een DPIA uit?')
      expect(text).toContain('Wettelijke verplichting')
      expect(text).toContain('IAMA')
      expect(text).toContain('Wanneer voer je een IAMA uit?')
      expect(text).toContain('Zie ook')
    })

    it('has parallel version headings: "DPIA versie 3.0" and "IAMA versie 2.0"', () => {
      const text = mount(AboutAssessments).text()
      expect(text).toContain('DPIA versie 3.0')
      expect(text).toContain('IAMA versie 2.0')
    })

    it('links to the DPIA informational models and reporting model', () => {
      const wrapper = mount(AboutAssessments)
      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))

      expect(hrefs).toContain('https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA')
      expect(hrefs).toContain(
        'https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx',
      )
      expect(hrefs).toContain(
        'https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html',
      )
    })
  })
})

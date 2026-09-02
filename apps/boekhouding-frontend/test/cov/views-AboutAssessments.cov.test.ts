/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AboutAssessments from '../../src/views/AboutAssessments.vue'
import { useBackLink } from '../../src/composables/useBackLink'
import { previousPage } from '../../src/router'

const { backLink, set } = useBackLink()

afterEach(() => {
  set(null)
  previousPage.value = null
  window.history.replaceState(null, '', window.location.href)
})

describe('AboutAssessments', () => {
  describe('back link', () => {
    it('names the page the reader came from', () => {
      previousPage.value = { text: 'Projecten', to: '/projecten' }

      mount(AboutAssessments)

      expect(backLink.value).toEqual({ text: 'Projecten', to: '/projecten' })
    })

    it('falls back to the start page when there is no previous page', () => {
      previousPage.value = null

      mount(AboutAssessments)

      expect(backLink.value).toEqual({ text: 'Startpagina', to: '/' })
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

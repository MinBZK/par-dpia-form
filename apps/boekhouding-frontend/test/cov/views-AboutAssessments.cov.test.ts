/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import AboutAssessments from '../../src/views/AboutAssessments.vue'

// Stub AppHeader to avoid pulling in vue-router + useAuth; the marker template
// re-exposes the bound props so the ternary branches can be asserted.
const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute', 'showBack'],
  template:
    '<header class="app-header-stub" ' +
    ':data-back-label="backLabel" ' +
    ":data-back-route=\"backRoute === undefined ? '__undefined__' : backRoute\" " +
    ':data-show-back="String(showBack)"></header>',
}

function mountAbout() {
  return mount(AboutAssessments, {
    global: { stubs: { AppHeader: AppHeaderStub } },
  })
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.href)
})

describe('AboutAssessments', () => {
  describe('hasHistory computed (window.history.state?.back)', () => {
    it('is falsy when history.state is null (optional chaining short-circuits)', () => {
      window.history.replaceState(null, '', window.location.href)

      const wrapper = mountAbout()
      const header = wrapper.find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is falsy when history.state exists but has no back entry', () => {
      window.history.replaceState({ other: 'value' }, '', window.location.href)

      const wrapper = mountAbout()
      const header = wrapper.find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is truthy when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)

      const wrapper = mountAbout()
      const header = wrapper.find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Terug')
      expect(header.attributes('data-back-route')).toBe('__undefined__')
      expect(header.attributes('data-show-back')).toBe('true')
    })
  })

  describe('static informational content', () => {
    it('renders the page heading', () => {
      window.history.replaceState({ back: '/' }, '', window.location.href)

      const wrapper = mountAbout()

      expect(wrapper.find('h1.utrecht-heading-1').text()).toBe('Over Invulhulpen')
    })

    it('renders the key section headings explaining pre-scan, DPIA and IAMA', () => {
      const wrapper = mountAbout()
      const text = wrapper.text()

      expect(text).toContain('Pre-scan')
      expect(text).toContain('DPIA')
      expect(text).toContain('Wanneer voer je een DPIA uit?')
      expect(text).toContain('Wettelijke verplichting')
      expect(text).toContain('IAMA')
      expect(text).toContain('Wanneer voer je een IAMA uit?')
      expect(text).toContain('Zie ook')
    })

    it('links to the DPIA informational models and reporting model', () => {
      const wrapper = mountAbout()
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

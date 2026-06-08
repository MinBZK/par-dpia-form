/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

import ContactPage from '../../src/views/ContactPage.vue'

const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute', 'showBack'],
  template:
    '<header class="app-header-stub" ' +
    ':data-back-label="backLabel" ' +
    ":data-back-route=\"backRoute === undefined ? '__undefined__' : backRoute\" " +
    ':data-show-back="String(showBack)"></header>',
}

function mountContact() {
  return mount(ContactPage, {
    global: { stubs: { AppHeader: AppHeaderStub } },
  })
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.href)
})

describe('ContactPage', () => {
  describe('hasHistory computed (window.history.state?.back)', () => {
    it('is falsy when history.state is null (optional chaining short-circuits)', () => {
      window.history.replaceState(null, '', window.location.href)

      const header = mountContact().find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is falsy when history.state exists but has no back entry', () => {
      window.history.replaceState({ other: 'value' }, '', window.location.href)

      const header = mountContact().find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('is truthy when history.state.back is set', () => {
      window.history.replaceState({ back: '/' }, '', window.location.href)

      const header = mountContact().find('.app-header-stub')

      expect(header.attributes('data-back-label')).toBe('Terug')
      expect(header.attributes('data-back-route')).toBe('__undefined__')
      expect(header.attributes('data-show-back')).toBe('true')
    })
  })

  describe('static content', () => {
    it('renders the page heading and the two contact sections', () => {
      const wrapper = mountContact()

      expect(wrapper.find('h1.utrecht-heading-1').text()).toBe('Contact')
      const text = wrapper.text()
      expect(text).toContain('Vragen over de applicatie')
      expect(text).toContain('Inhoudelijke vragen over pre-scan, DPIA of IAMA')
    })

    it('links to the RIG mailbox, GitHub issues and Privacy Adviseurs Rijk', () => {
      const wrapper = mountContact()
      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))

      expect(hrefs).toContain('mailto:RIG@rijksoverheid.nl')
      expect(hrefs).toContain('https://github.com/MinBZK/par-dpia-form/issues')
      expect(hrefs).toContain(
        'https://rijksportaal.overheid-i.nl/organisaties/bzk/artikelen/dg-digitalisering-en-overheidsorganisatie-dgdoo/cio-rijk/informatiebeveiliging-en-privacy/privacy-adviseurs-rijk-par.html',
      )
    })
  })
})

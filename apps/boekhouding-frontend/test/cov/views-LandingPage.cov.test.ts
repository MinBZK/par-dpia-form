/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const authenticated = ref(false)
const login = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: computed(() => authenticated.value),
    login,
  }),
}))

vi.mock('../../src/config', () => ({
  getConfig: () => ({
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'invulhulpen',
    keycloakClientId: 'boekhouding-frontend',
    standaloneUrl: '/zonder-account/',
  }),
}))

import LandingPage from '../../src/views/LandingPage.vue'

const mountPage = () =>
  mount(LandingPage, {
    global: {
      stubs: {
        RouterLink: {
          name: 'RouterLink',
          props: ['to'],
          template: '<a class="router-link" :href="to"><slot /></a>',
        },
      },
    },
  })

const standaloneButtons = (wrapper: ReturnType<typeof mountPage>) =>
  wrapper.findAll('nldd-button').filter((b) => b.attributes('href') === '/zonder-account/')

// The samenwerken action is the only nldd-button without an href (it navigates
// via the goToProjects click handler instead of a link).
const samenwerkenButton = (wrapper: ReturnType<typeof mountPage>) =>
  wrapper.findAll('nldd-button').find((b) => b.attributes('href') === undefined)!

beforeEach(() => {
  routerPush.mockClear()
  login.mockClear()
  authenticated.value = false
})

describe('LandingPage', () => {
  describe('hero', () => {
    it('renders exactly one h1 with the grip headline', () => {
      const wrapper = mountPage()
      const h1s = wrapper.findAll('h1')
      expect(h1s).toHaveLength(1)
      expect(h1s[0].text()).toBe("Krijg grip op pre-scans, DPIA's en IAMA's")
    })

    it('introduces the pre-scan as the starting point and the ways of working, with no en/em-dash', () => {
      const wrapper = mountPage()
      const lead = wrapper.find("[aria-labelledby='landing-hero-title'] nldd-text").text()
      expect(lead).toContain('Begin met de pre-scan')
      expect(lead).toContain('zonder account')
      // Project rule: use a normal hyphen "-", never an en/em-dash.
      expect(lead).not.toMatch(/[–—]/)
    })

    it('has no buttons or links in the hero (the choice lives in the block below)', () => {
      const wrapper = mountPage()
      const hero = wrapper.find("[aria-labelledby='landing-hero-title']")
      expect(hero.findAll('a')).toHaveLength(0)
      expect(hero.findAll('button')).toHaveLength(0)
      expect(hero.findAll('nldd-button')).toHaveLength(0)
    })
  })

  describe('standalone link from getConfig().standaloneUrl', () => {
    it('renders the standalone link once, in the zelfstandig card', () => {
      const wrapper = mountPage()
      const buttons = standaloneButtons(wrapper)
      expect(buttons).toHaveLength(1)
      expect(buttons[0].attributes('text')).toBe('Start zonder account')
    })
  })

  describe('"Kies hoe je werkt" paths', () => {
    it('describes the zelfstandig path in prose (local browser + offline)', () => {
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Zelfstandig invullen')
      expect(text).toContain('lokaal in je browser')
      expect(text).toContain('offline')
    })

    it('describes the samenwerken path with projects, version control and comments', () => {
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Groepeer je pre-scans')
      expect(text).toContain('versiebeheer')
      expect(text).toContain('opmerkingen')
    })

    it('makes both path buttons primary (blue)', () => {
      const wrapper = mountPage()
      expect(samenwerkenButton(wrapper).attributes('variant')).toBe('primary')
      expect(standaloneButtons(wrapper)[0].attributes('variant')).toBe('primary')
    })
  })

  describe('Samenwerken copy (v-if="isAuthenticated")', () => {
    it('shows the unauthenticated copy when not logged in', () => {
      authenticated.value = false
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Log in om samen met collega')
      // Collaborators are framed as colleagues and advisers in the samenwerken card.
      expect(text).toContain('adviseurs')
      expect(text).not.toContain('Ga naar je projecten')
    })

    it('shows the authenticated copy when logged in', () => {
      authenticated.value = true
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Ga naar je projecten')
      expect(text).not.toContain('Log in om samen met collega')
    })
  })

  describe('Samenwerken button label (ternary)', () => {
    it('labels the button "Inloggen" when not authenticated', () => {
      authenticated.value = false
      const wrapper = mountPage()
      expect(samenwerkenButton(wrapper).attributes('text')).toBe('Inloggen')
    })

    it('labels the button "Naar projecten" when authenticated', () => {
      authenticated.value = true
      const wrapper = mountPage()
      expect(samenwerkenButton(wrapper).attributes('text')).toBe('Naar projecten')
    })
  })

  describe('goToProjects() click handler', () => {
    it('navigates to /projecten when authenticated and does not call login', async () => {
      authenticated.value = true
      const wrapper = mountPage()
      await samenwerkenButton(wrapper).trigger('click')
      await flushPromises()
      expect(routerPush).toHaveBeenCalledWith('/projecten')
      expect(login).not.toHaveBeenCalled()
    })

    it('awaits login() when not authenticated and does not navigate', async () => {
      authenticated.value = false
      const wrapper = mountPage()
      await samenwerkenButton(wrapper).trigger('click')
      await flushPromises()
      expect(login).toHaveBeenCalledTimes(1)
      expect(routerPush).not.toHaveBeenCalled()
    })
  })

  describe('"Voor de overheid, door de overheid" pillars', () => {
    it('uses the tagline as the section heading', () => {
      const wrapper = mountPage()
      const heading = wrapper.find('#landing-pillars-title')
      expect(heading.exists()).toBe(true)
      expect(heading.text()).toBe('Voor de overheid, door de overheid')
    })

    it('renders four pillars as icon rows in a collection grid', () => {
      const wrapper = mountPage()
      const section = wrapper.find('[aria-labelledby="landing-pillars-title"]')
      const grid = section.find('nldd-collection')
      expect(grid.attributes('layout')).toBe('grid')
      expect(grid.attributes('item-width')).toBe('20rem')
      const pillars = grid.findAll('nldd-container[layout="row"]')
      expect(pillars).toHaveLength(4)
      for (const pillar of pillars) {
        expect(pillar.attributes('vertical-alignment')).toBe('top')
        expect(pillar.find('nldd-title > h3').exists()).toBe(true)
        expect(pillar.find('nldd-text').exists()).toBe(true)
      }
      const icons = grid.findAll('nldd-icon')
      expect(icons.map((icon) => icon.attributes('name'))).toEqual([
        'book',
        'square-grid-2x2',
        'seal-check-mark',
        'numbered-list',
      ])
      for (const icon of icons) {
        expect(icon.attributes('size')).toBe('24')
        expect(icon.attributes('color')).toBe('donkerblauw')
      }
    })

    it('includes the AMT-inspired pillar headings and drops the AI-verordening pillar', () => {
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('Gebaseerd op rijksbrede kaders')
      expect(text).toContain('Alles op één plek')
      expect(text).toContain('Standaardisatie')
      expect(text).toContain('Stapsgewijs')
      expect(text).not.toContain('Aansluitend op de AI-verordening')
    })

    it('cites the DPIA reporting model v3.0 and the IAMA v2.0', () => {
      const wrapper = mountPage()
      const text = wrapper.text()
      expect(text).toContain('versie 3.0')
      expect(text).toContain('versie 2.0')
    })
  })

  describe('de drie assessments', () => {
    it('renders three cards with the full name and abbreviation as heading', () => {
      const wrapper = mountPage()
      const section = wrapper.find('#assessments')
      expect(section.exists()).toBe(true)
      expect(section.findAll('nldd-card')).toHaveLength(3)
      expect(section.findAll('h3').map((h) => h.text())).toEqual([
        'Pre-scan',
        'Data Protection Impact Assessment (DPIA)',
        'Impact Assessment Mensenrechten en Algoritmes (IAMA)',
      ])
    })

    it('frames the IAMA as preventive without the absolute "altijd"', () => {
      const wrapper = mountPage()
      const text = wrapper.find('#assessments').text()
      expect(text).toContain('voorafgaand aan de ontwikkeling of inzet')
      expect(text).not.toContain('altijd')
    })

    it('links to the over page', () => {
      const wrapper = mountPage()
      const overLink = wrapper.find('a[href="/over"]')
      expect(overLink.exists()).toBe(true)
      expect(overLink.text()).toBe('Lees meer over de invulhulpen')
    })
  })
})

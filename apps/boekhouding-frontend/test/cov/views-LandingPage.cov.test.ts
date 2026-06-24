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
        AppHeader: { template: '<header class="app-header-stub" />' },
        RouterLink: {
          name: 'RouterLink',
          props: ['to'],
          template: '<a class="router-link" :href="to"><slot /></a>',
        },
      },
    },
  })

const standaloneLinks = (wrapper: ReturnType<typeof mountPage>) =>
  wrapper.findAll('a').filter((a) => a.attributes('href') === '/zonder-account/')

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
      const lead = wrapper.find('.landing-hero__lead').text()
      expect(lead).toContain('Begin met de pre-scan')
      expect(lead).toContain('zonder account')
      // Project rule: use a normal hyphen "-", never an en/em-dash.
      expect(lead).not.toMatch(/[–—]/)
    })

    it('has no buttons or links in the hero (the choice lives in the block below)', () => {
      const wrapper = mountPage()
      const hero = wrapper.find('.landing-hero')
      expect(hero.findAll('a')).toHaveLength(0)
      expect(hero.findAll('button')).toHaveLength(0)
    })
  })

  describe('standalone link from getConfig().standaloneUrl', () => {
    it('renders the standalone link once, in the zelfstandig card', () => {
      const wrapper = mountPage()
      const links = standaloneLinks(wrapper)
      expect(links).toHaveLength(1)
      expect(links[0].text()).toBe('Start zonder account')
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

    it('makes the login button primary (blue), like the start button', () => {
      const wrapper = mountPage()
      const button = wrapper.find('button.rvo-button')
      expect(button.classes()).toContain('rvo-button--primary')
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
      expect(wrapper.find('button.rvo-button').text()).toBe('Inloggen')
    })

    it('labels the button "Naar projecten" when authenticated', () => {
      authenticated.value = true
      const wrapper = mountPage()
      expect(wrapper.find('button.rvo-button').text()).toBe('Naar projecten')
    })
  })

  describe('goToProjects() click handler', () => {
    it('navigates to /projecten when authenticated and does not call login', async () => {
      authenticated.value = true
      const wrapper = mountPage()
      await wrapper.find('button.rvo-button').trigger('click')
      await flushPromises()
      expect(routerPush).toHaveBeenCalledWith('/projecten')
      expect(login).not.toHaveBeenCalled()
    })

    it('awaits login() when not authenticated and does not navigate', async () => {
      authenticated.value = false
      const wrapper = mountPage()
      await wrapper.find('button.rvo-button').trigger('click')
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

    it('renders four pillars whose icons are all decorative', () => {
      const wrapper = mountPage()
      expect(wrapper.findAll('.landing-pillar')).toHaveLength(4)
      const icons = wrapper.findAll('.landing-pillar__icon')
      expect(icons).toHaveLength(4)
      for (const icon of icons) {
        expect(icon.attributes('aria-hidden')).toBe('true')
        expect(icon.attributes('focusable')).toBe('false')
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
      expect(section.findAll('.rvo-card')).toHaveLength(3)
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

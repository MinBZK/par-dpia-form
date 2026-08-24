/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { loadVersion, getConfig, probe, FakeTimeoutError } = vi.hoisted(() => {
  class FakeTimeoutError extends Error {}
  return { loadVersion: vi.fn(), getConfig: vi.fn(), probe: vi.fn(), FakeTimeoutError }
})

vi.mock('../../src/version', () => ({ loadVersion: () => loadVersion() }))
vi.mock('../../src/config', () => ({ getConfig: () => getConfig() }))
vi.mock('../../src/probe', () => ({
  probe: (url: string) => probe(url),
  TimeoutError: FakeTimeoutError,
}))

import StatusPage from '../../src/views/StatusPage.vue'
import { useBackLink } from '../../src/composables/useBackLink'

const REPO = 'https://github.com/MinBZK/par-dpia-form'

const { backLink, set: setBackLink } = useBackLink()

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as unknown as Response
}

function mountStatus() {
  return mount(StatusPage)
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  loadVersion.mockResolvedValue({ version: 'dev', commit: 'dev', channel: 'dev' })
  getConfig.mockReturnValue({
    keycloakUrl: 'https://keycloak.rijksapp.nl',
    keycloakRealm: 'invulhulpen',
  })
  probe.mockResolvedValue(jsonResponse({ status: 'ok' }))
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  vi.clearAllMocks()
  setBackLink(null)
  window.history.replaceState(null, '', window.location.href)
})

describe('StatusPage', () => {
  describe('back link (window.history.state?.back)', () => {
    it('sets "Ga naar home" towards / when history.state is null', () => {
      window.history.replaceState(null, '', window.location.href)
      mountStatus()
      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Ga naar home" when history.state has no back entry', () => {
      window.history.replaceState({ other: 1 }, '', window.location.href)
      mountStatus()
      expect(backLink.value).toEqual({ text: 'Ga naar home', to: '/' })
    })

    it('sets "Terug" without a target route when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)
      mountStatus()
      expect(backLink.value).toEqual({ text: 'Terug' })
    })
  })

  it('shows the loading state (neutral tag with activity indicator) before the probes resolve', () => {
    probe.mockReturnValue(new Promise(() => {})) // never resolves
    const wrapper = mountStatus()
    const backend = wrapper.get('[data-test="backend-state"]')
    expect(backend.attributes('text')).toBe('Controleren')
    expect(backend.attributes('color')).toBe('neutral')
    expect(backend.find('nldd-activity-indicator').exists()).toBe(true)
    expect(backend.find('nldd-icon').exists()).toBe(false)
    const keycloak = wrapper.get('[data-test="keycloak-state"]')
    expect(keycloak.attributes('text')).toBe('Controleren')
    expect(keycloak.attributes('color')).toBe('neutral')
    expect(keycloak.find('nldd-activity-indicator').exists()).toBe(true)
  })

  it('renders the status cards with small description text and a centred tag in the footer', () => {
    probe.mockReturnValue(new Promise(() => {}))
    const wrapper = mountStatus()
    const cards = wrapper.findAll('nldd-card').slice(0, 2)
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(card.get('nldd-text').attributes('size')).toBe('xs')
      const footer = card.get('nldd-container[slot="footer"]')
      expect(footer.attributes('horizontal-alignment')).toBe('center')
      expect(footer.get('[role="status"]').find('nldd-tag').exists()).toBe(true)
    }
  })

  it('reports both services reachable and shows only the release version (no commit)', async () => {
    loadVersion.mockResolvedValue({ version: 'v2026.6.14', commit: 'abc1234', channel: 'productie' })

    const wrapper = mountStatus()
    await flushPromises()

    const backend = wrapper.get('[data-test="backend-state"]')
    expect(backend.attributes('text')).toBe('Alles werkt')
    expect(backend.attributes('color')).toBe('success')
    expect(backend.find('nldd-activity-indicator').exists()).toBe(false)
    expect(backend.get('nldd-icon').attributes('name')).toBe('check-mark-circle')
    expect(wrapper.get('[data-test="keycloak-state"]').attributes('text')).toBe('Alles werkt')
    expect(wrapper.get('[data-test="version"]').text()).toBe('v2026.6.14')
    expect(wrapper.find('[data-test="build"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('op commit')
    expect(wrapper.get('[data-test="github-link"]').attributes('href')).toBe(`${REPO}/commit/abc1234`)
    expect(probe).toHaveBeenCalledWith('/api/health')
    expect(probe).toHaveBeenCalledWith(
      'https://keycloak.rijksapp.nl/realms/invulhulpen/.well-known/openid-configuration',
    )
  })

  it('shows "Ontwikkelversie op commit" when there is a commit but no release version', async () => {
    loadVersion.mockResolvedValue({ version: 'dev', commit: 'acc1234', channel: 'acceptatie' })

    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.text()).toContain('Ontwikkelversie')
    expect(wrapper.text()).toContain('op commit')
    expect(wrapper.find('[data-test="version"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="build"]').text()).toBe('acc1234')
    expect(wrapper.get('[data-test="github-link"]').attributes('href')).toBe(`${REPO}/commit/acc1234`)
  })

  it('shows only "Ontwikkelversie" and links to the project root for a local build', async () => {
    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.text()).toContain('Ontwikkelversie')
    expect(wrapper.text()).not.toContain('op commit')
    expect(wrapper.find('[data-test="version"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="build"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="github-link"]').attributes('href')).toBe(REPO)
  })

  it('marks the GitHub link as opening in a new tab with an external-link icon', async () => {
    const wrapper = mountStatus()
    await flushPromises()

    // target="_blank" makes nldd-button render an anchor that announces
    // "opent in nieuw tabblad" for screen readers and defaults rel to
    // "noopener noreferrer" inside its shadow DOM.
    const link = wrapper.get('[data-test="github-link"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('text')).toBe('Open op GitHub')
    expect(link.attributes('end-icon')).toBe('external-link')
  })

  it('reports de achterkant not reachable on a network error', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(jsonResponse({})),
    )
    const wrapper = mountStatus()
    await flushPromises()

    const backend = wrapper.get('[data-test="backend-state"]')
    expect(backend.attributes('text')).toBe('Er werkt iets niet')
    expect(backend.attributes('color')).toBe('critical')
    expect(backend.get('nldd-icon').attributes('name')).toBe('close-circle')
    expect(wrapper.get('[data-test="keycloak-state"]').attributes('text')).toBe('Alles werkt')
  })

  it('reports a time-out when de achterkant probe times out', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.reject(new FakeTimeoutError())
        : Promise.resolve(jsonResponse({})),
    )
    const wrapper = mountStatus()
    await flushPromises()

    const backend = wrapper.get('[data-test="backend-state"]')
    expect(backend.attributes('text')).toBe('Reageert traag')
    expect(backend.attributes('color')).toBe('warning')
    expect(backend.get('nldd-icon').attributes('name')).toBe('exclamation-triangle')
  })

  it('reports de aanmeldvoorziening not reachable when the Keycloak probe fails', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.resolve(jsonResponse({}))
        : Promise.reject(new Error('kc down')),
    )
    const wrapper = mountStatus()
    await flushPromises()

    const keycloak = wrapper.get('[data-test="keycloak-state"]')
    expect(keycloak.attributes('text')).toBe('Er werkt iets niet')
    expect(keycloak.attributes('color')).toBe('critical')
  })

  describe('kopieer versie-informatie', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    async function mountAndCopy() {
      const wrapper = mountStatus()
      await vi.advanceTimersByTimeAsync(1)
      await wrapper.get('[data-test="copy-version"]').trigger('click')
      await vi.advanceTimersByTimeAsync(1)
      return wrapper
    }

    it('copies only the release version (no commit) in production and confirms on the button', async () => {
      loadVersion.mockResolvedValue({ version: 'v2026.6.14', commit: 'abc1234', channel: 'productie' })
      const wrapper = await mountAndCopy()

      expect(writeText).toHaveBeenCalledWith('Invulhulpen versie v2026.6.14')
      const button = wrapper.get('[data-test="copy-version"]')
      expect(button.attributes('text')).toBe('Gekopieerd')
      expect(button.attributes('start-icon')).toBe('check-mark')
      expect(wrapper.get('[data-test="copy-feedback"]').text()).toContain('Gekopieerd')
    })

    it('copies "ontwikkelversie op commit" for an acceptance build', async () => {
      loadVersion.mockResolvedValue({ version: 'dev', commit: 'acc1234', channel: 'acceptatie' })
      await mountAndCopy()

      expect(writeText).toHaveBeenCalledWith('Invulhulpen ontwikkelversie op commit acc1234')
    })

    it('copies "ontwikkelversie" (without commit) for a local build', async () => {
      await mountAndCopy()

      expect(writeText).toHaveBeenCalledWith('Invulhulpen ontwikkelversie')
    })

    it('restores the button label after the confirmation delay', async () => {
      const wrapper = await mountAndCopy()
      expect(wrapper.get('[data-test="copy-version"]').attributes('text')).toBe('Gekopieerd')

      await vi.advanceTimersByTimeAsync(3000)

      const button = wrapper.get('[data-test="copy-version"]')
      expect(button.attributes('text')).toBe('Kopieer versie-informatie')
      expect(button.attributes('start-icon')).toBe('copy')
    })

    it('shows an error on the button when copying to the clipboard fails', async () => {
      writeText.mockRejectedValue(new Error('clipboard blocked'))
      const wrapper = await mountAndCopy()

      const button = wrapper.get('[data-test="copy-version"]')
      expect(button.attributes('text')).toBe('Kopiëren mislukt')
      expect(button.attributes('start-icon')).toBe('exclamation-triangle')
      expect(wrapper.get('[data-test="copy-feedback"]').text()).toContain('lukte niet')
    })
  })
})

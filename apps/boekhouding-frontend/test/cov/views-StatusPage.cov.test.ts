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

const REPO = 'https://github.com/MinBZK/par-dpia-form'

const AppHeaderStub = {
  name: 'AppHeader',
  props: ['backLabel', 'backRoute', 'showBack'],
  template:
    '<header class="app-header-stub" ' +
    ':data-back-label="backLabel" ' +
    ":data-back-route=\"backRoute === undefined ? '__undefined__' : backRoute\" " +
    ':data-show-back="String(showBack)"></header>',
}

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as unknown as Response
}

function mountStatus() {
  return mount(StatusPage, { global: { stubs: { AppHeader: AppHeaderStub } } })
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
  window.history.replaceState(null, '', window.location.href)
})

describe('StatusPage', () => {
  describe('hasHistory computed', () => {
    it('uses "Ga naar home" when history.state is null', () => {
      window.history.replaceState(null, '', window.location.href)
      const header = mountStatus().find('.app-header-stub')
      expect(header.attributes('data-back-label')).toBe('Ga naar home')
      expect(header.attributes('data-back-route')).toBe('/')
      expect(header.attributes('data-show-back')).toBe('false')
    })

    it('uses "Ga naar home" when history.state has no back entry', () => {
      window.history.replaceState({ other: 1 }, '', window.location.href)
      const header = mountStatus().find('.app-header-stub')
      expect(header.attributes('data-back-label')).toBe('Ga naar home')
    })

    it('uses "Terug" when history.state.back is set', () => {
      window.history.replaceState({ back: '/projecten' }, '', window.location.href)
      const header = mountStatus().find('.app-header-stub')
      expect(header.attributes('data-back-label')).toBe('Terug')
      expect(header.attributes('data-back-route')).toBe('__undefined__')
      expect(header.attributes('data-show-back')).toBe('true')
    })
  })

  it('shows the loading state before the probes resolve', () => {
    probe.mockReturnValue(new Promise(() => {})) // never resolves
    const wrapper = mountStatus()
    expect(wrapper.get('[data-test="backend-state"]').text()).toBe('Controleren')
    expect(wrapper.get('[data-test="keycloak-state"]').text()).toBe('Controleren')
  })

  it('reports both services reachable and shows only the release version (no commit)', async () => {
    loadVersion.mockResolvedValue({ version: 'v2026.6.14', commit: 'abc1234', channel: 'productie' })

    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.get('[data-test="backend-state"]').text()).toBe('Alles werkt')
    expect(wrapper.get('[data-test="keycloak-state"]').text()).toBe('Alles werkt')
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

    const link = wrapper.get('[data-test="github-link"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.find('[data-test="external-icon"]').exists()).toBe(true)
    expect(link.text()).toContain('nieuw tabblad')
  })

  it('reports de achterkant not reachable on a network error', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(jsonResponse({})),
    )
    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.get('[data-test="backend-state"]').text()).toBe('Er werkt iets niet')
    expect(wrapper.get('[data-test="keycloak-state"]').text()).toBe('Alles werkt')
  })

  it('reports a time-out when de achterkant probe times out', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.reject(new FakeTimeoutError())
        : Promise.resolve(jsonResponse({})),
    )
    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.get('[data-test="backend-state"]').text()).toBe('Reageert traag')
  })

  it('reports de aanmeldvoorziening not reachable when the Keycloak probe fails', async () => {
    probe.mockImplementation((url: string) =>
      url === '/api/health'
        ? Promise.resolve(jsonResponse({}))
        : Promise.reject(new Error('kc down')),
    )
    const wrapper = mountStatus()
    await flushPromises()

    expect(wrapper.get('[data-test="keycloak-state"]').text()).toBe('Er werkt iets niet')
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
      expect(wrapper.get('[data-test="copy-version"]').text()).toContain('Gekopieerd')
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
      expect(wrapper.get('[data-test="copy-version"]').text()).toContain('Gekopieerd')

      await vi.advanceTimersByTimeAsync(3000)

      expect(wrapper.get('[data-test="copy-version"]').text()).toContain('Kopieer versie-informatie')
    })

    it('shows an error on the button when copying to the clipboard fails', async () => {
      writeText.mockRejectedValue(new Error('clipboard blocked'))
      const wrapper = await mountAndCopy()

      expect(wrapper.get('[data-test="copy-version"]').text()).toContain('mislukt')
      expect(wrapper.get('[data-test="copy-feedback"]').text()).toContain('lukte niet')
    })
  })
})

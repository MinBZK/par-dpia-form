import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { FormType, type NavigationFunctions } from '@overheid-assessment/core'
import LandingView from '@/components/LandingView.vue'

function makeNavigation(): NavigationFunctions {
  return {
    goToLanding: vi.fn(),
    goToDPIA: vi.fn(),
    goToPreScanDPIA: vi.fn(),
    goToIAMA: vi.fn(),
  }
}

function mountLanding(
  overrides: { navigation?: NavigationFunctions; cachedTypes?: FormType[] } = {},
) {
  const navigation = overrides.navigation ?? makeNavigation()
  return mount(LandingView, {
    props: { navigation, cachedTypes: overrides.cachedTypes ?? [] },
  })
}

function clickButtonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button.trigger('click')
}

describe('LandingView rendering', () => {
  it('renders the page heading and the AppBanner', () => {
    const wrapper = mountLanding()

    expect(wrapper.find('h1.utrecht-heading-1').text()).toBe(
      'Invulhulp voor pre-scan, DPIA en IAMA',
    )
    expect(wrapper.findComponent({ name: 'AppBanner' }).exists()).toBe(true)
  })

  it('shows the "Invulhulpen" title next to the logo', () => {
    const wrapper = mountLanding()
    expect(wrapper.find('.rvo-logo__title').text()).toBe('Invulhulpen')
  })

  it('renders the assessment cards with their Dutch descriptions', () => {
    const wrapper = mountLanding()

    const headings = wrapper.findAll('h2.utrecht-heading-2').map((h) => h.text())
    expect(headings).toContain('Pre-scan')
    expect(headings).toContain('DPIA')
    expect(headings).toContain('IAMA')

    expect(wrapper.text()).toContain('Toets of een DPIA, DTIA, IAMA of KIA nodig is.')
    expect(wrapper.text()).toContain('Vul stap voor stap het rijksmodel DPIA in.')
  })

  it('renders all three start buttons with the correct Dutch labels when no cache exists', () => {
    const wrapper = mountLanding()

    const buttonLabels = wrapper.findAll('button.card-button').map((b) => b.text())
    expect(buttonLabels).toEqual(['Start pre-scan', 'Start DPIA', 'Start IAMA'])
  })

  it('renders the "Over deze tools" informational section', () => {
    const wrapper = mountLanding()

    expect(wrapper.text()).toContain('Over deze tools')
    expect(wrapper.text()).toContain('pre-scan, DPIA en het IAMA')
  })
})

describe('LandingView navigation interaction (no cache)', () => {
  it('calls navigation.goToPreScanDPIA when the pre-scan button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mountLanding({ navigation })

    await clickButtonByText(wrapper, 'Start pre-scan')

    expect(navigation.goToPreScanDPIA).toHaveBeenCalledTimes(1)
    expect(navigation.goToDPIA).not.toHaveBeenCalled()
  })

  it('calls navigation.goToDPIA when the DPIA button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mountLanding({ navigation })

    await clickButtonByText(wrapper, 'Start DPIA')

    expect(navigation.goToDPIA).toHaveBeenCalledTimes(1)
    expect(navigation.goToPreScanDPIA).not.toHaveBeenCalled()
  })

  it('calls navigation.goToIAMA when the IAMA button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mountLanding({ navigation })

    await clickButtonByText(wrapper, 'Start IAMA')

    expect(navigation.goToIAMA).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the IAMA button is clicked without a goToIAMA handler', async () => {
    const navigation: NavigationFunctions = {
      goToLanding: vi.fn(),
      goToDPIA: vi.fn(),
      goToPreScanDPIA: vi.fn(),
    }
    const wrapper = mountLanding({ navigation })

    await expect(clickButtonByText(wrapper, 'Start IAMA')).resolves.not.toThrow()
  })
})

describe('LandingView cached-session choice (#322)', () => {
  it('shows "Verder gaan" and a per-type "Start nieuwe ..." instead of "Start" for a cached assessment', () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })

    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toContain('Verder gaan')
    expect(labels).toContain('Start nieuwe DPIA')
    // The cached card no longer shows its plain start button.
    expect(labels).not.toContain('Start DPIA')
    // Other cards remain unaffected.
    expect(labels).toContain('Start pre-scan')
  })

  it('"Verder gaan" resumes via the matching navigation function', async () => {
    const navigation = makeNavigation()
    const wrapper = mountLanding({ navigation, cachedTypes: [FormType.DPIA] })

    await clickButtonByText(wrapper, 'Verder gaan')

    expect(navigation.goToDPIA).toHaveBeenCalledTimes(1)
  })

  it('"Start nieuwe DPIA" opens a type-specific confirmation and emits startFresh on confirm', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await clickButtonByText(wrapper, 'Start nieuwe DPIA')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Nieuwe DPIA starten?')

    await clickButtonByText(wrapper, 'Ja, start nieuwe DPIA')

    expect(wrapper.emitted('startFresh')).toEqual([[FormType.DPIA]])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('closes the confirmation without emitting when cancelled', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.PRE_SCAN] })

    await clickButtonByText(wrapper, 'Start nieuwe pre-scan')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await clickButtonByText(wrapper, 'Annuleren')

    expect(wrapper.emitted('startFresh')).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('closes the confirmation when the backdrop is clicked', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.IAMA] })

    await clickButtonByText(wrapper, 'Start nieuwe IAMA')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await wrapper.find('.fresh-confirm-overlay').trigger('click')

    expect(wrapper.emitted('startFresh')).toBeUndefined()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})

describe('LandingView offline-download visibility', () => {
  const realLocation = window.location

  function setProtocol(protocol: string): void {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol, href: 'http://localhost/index.html' },
    })
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  })

  it('hides the offline-download section in dev (non-production build)', () => {
    vi.stubEnv('PROD', false)
    const wrapper = mountLanding()
    expect(wrapper.text()).not.toContain('Offline gebruiken')
  })

  it('hides the offline-download section when opened as a local file', () => {
    vi.stubEnv('PROD', true)
    setProtocol('file:')
    const wrapper = mountLanding()
    expect(wrapper.text()).not.toContain('Offline gebruiken')
  })

  it('shows the offline-download section on the hosted, built app', () => {
    vi.stubEnv('PROD', true)
    setProtocol('https:')
    const wrapper = mountLanding()
    expect(wrapper.text()).toContain('Offline gebruiken')
  })
})

describe('LandingView offline HTML download', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // The download UI is only rendered on the hosted, built app.
    vi.stubEnv('PROD', true)
    createObjectURL = vi.fn(() => 'blob:fake-url')
    revokeObjectURL = vi.fn()
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL
    ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('downloads the running HTML as a standalone file on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>standalone</html>'),
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountLanding()
    await clickButtonByText(wrapper, 'Download invulhulp als HTML-bestand')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(window.location.href, { cache: 'no-store' })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows an error message when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const wrapper = mountLanding()
    await clickButtonByText(wrapper, 'Download invulhulp als HTML-bestand')
    await flushPromises()

    expect(clickSpy).not.toHaveBeenCalled()
    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Het downloaden is niet gelukt')
  })

  it('shows an error message when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const wrapper = mountLanding()
    await clickButtonByText(wrapper, 'Download invulhulp als HTML-bestand')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})

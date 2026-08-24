import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { FormType, type NavigationFunctions } from '@overheid-assessment/core'
import LandingView from '@/components/LandingView.vue'

// ConfirmDialog uses native <dialog>.showModal(), which jsdom lacks.
beforeAll(() => {
  const proto = (globalThis as unknown as { HTMLDialogElement: typeof HTMLDialogElement })
    .HTMLDialogElement.prototype as HTMLDialogElement & { showModal: () => void; close: () => void }
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

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
  const button = wrapper.findAll('nldd-button').find((b) => b.attributes('text') === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button.trigger('click')
}

function findModal(wrapper: VueWrapper) {
  return wrapper.find('nldd-modal-dialog')
}

// The page holds two modals: the per-assessment "start fresh" one first, the
// wipe-everything one after it.
function findClearAllModal(wrapper: VueWrapper) {
  return wrapper.findAll('nldd-modal-dialog')[1]
}

// The nldd-modal-dialog custom element is not registered in jsdom; its
// imperative API is stubbed per test on the host element.
function stubModal(wrapper: VueWrapper) {
  const host = findModal(wrapper).element as HTMLElement & {
    show?: () => void
    hide?: () => void
  }
  host.show = vi.fn()
  host.hide = vi.fn()
  return host
}

describe('LandingView rendering', () => {
  it('renders the page heading and the AppBanner', () => {
    const wrapper = mountLanding()

    expect(wrapper.find('h1').text()).toBe(
      'Invulhulpen voor pre-scan, DPIA en IAMA',
    )
    expect(wrapper.findComponent({ name: 'AppBanner' }).exists()).toBe(true)
  })

  it('shows the "Invulhulpen" wordmark on the top navigation bar', () => {
    const wrapper = mountLanding()
    expect(wrapper.find('nldd-top-navigation-bar').attributes('logo-title')).toBe('Invulhulpen')
  })

  it('renders the assessment cards with their Dutch descriptions', () => {
    const wrapper = mountLanding()

    const cards = wrapper.findAll('nldd-collection nldd-card')
    expect(cards).toHaveLength(3)

    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).toContain('Pre-scan')
    expect(headings).toContain('DPIA')
    expect(headings).toContain('IAMA')

    expect(wrapper.text()).toContain('Toets of een DPIA, DTIA, IAMA of KIA nodig is.')
    expect(wrapper.text()).toContain('Vul stap voor stap het rijksmodel DPIA in.')
  })

  it('renders all three start buttons with the correct Dutch labels when no cache exists', () => {
    const wrapper = mountLanding()

    const buttonLabels = wrapper.findAll('nldd-button.card-button').map((b) => b.attributes('text'))
    expect(buttonLabels).toEqual(['Start pre-scan', 'Start DPIA', 'Start IAMA'])
  })

  it('renders the "Over deze tools" informational section', () => {
    const wrapper = mountLanding()

    expect(wrapper.text()).toContain('Over deze tools')
    expect(wrapper.text()).toContain('pre-scan, DPIA en het IAMA')
  })

  it('shows the build version from the app-version meta tag', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'app-version')
    meta.setAttribute('content', 'v2026.6.14')
    document.head.appendChild(meta)
    try {
      const wrapper = mountLanding()
      expect(wrapper.find('.version-info').text()).toBe('Versie van de invulhulp: v2026.6.14')
    } finally {
      meta.remove()
    }
  })

  it('renders an empty version when the app-version meta tag is absent', () => {
    document.querySelector('meta[name="app-version"]')?.remove()
    const wrapper = mountLanding()
    expect(wrapper.find('.version-info').text()).toBe('Versie van de invulhulp:')
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

    const labels = wrapper.findAll('nldd-button').map((b) => b.attributes('text'))
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
    const host = stubModal(wrapper)

    expect(findModal(wrapper).attributes('text')).toBe('')

    await clickButtonByText(wrapper, 'Start nieuwe DPIA')

    expect(host.show).toHaveBeenCalledTimes(1)
    const modal = findModal(wrapper)
    expect(modal.attributes('variant')).toBe('alert')
    expect(modal.attributes('text')).toBe('Nieuwe DPIA starten?')
    expect(modal.attributes('supporting-text')).toContain('Je hebt een opgeslagen versie van de DPIA')

    await clickButtonByText(wrapper, 'Ja, start nieuwe DPIA')

    expect(wrapper.emitted('startFresh')).toEqual([[FormType.DPIA]])
    expect(host.hide).toHaveBeenCalledTimes(1)
    expect(findModal(wrapper).attributes('text')).toBe('')
  })

  it('closes the confirmation without emitting when cancelled', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.PRE_SCAN] })

    // No show/hide stubs here: the optional calls must no-op while the custom
    // element is not upgraded (jsdom).
    await clickButtonByText(wrapper, 'Start nieuwe pre-scan')
    expect(findModal(wrapper).attributes('text')).toBe('Nieuwe Pre-scan starten?')

    await clickButtonByText(wrapper, 'Annuleren')

    expect(wrapper.emitted('startFresh')).toBeUndefined()
    expect(findModal(wrapper).attributes('text')).toBe('')
  })

  it('cancels when the platform closes the modal (Esc / backdrop)', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.IAMA] })

    await clickButtonByText(wrapper, 'Start nieuwe IAMA')
    expect(findModal(wrapper).attributes('text')).toBe('Nieuwe IAMA starten?')

    findModal(wrapper).element.dispatchEvent(new CustomEvent('close'))
    await nextTick()

    expect(wrapper.emitted('startFresh')).toBeUndefined()
    expect(findModal(wrapper).attributes('text')).toBe('')
  })

  it('ignores a close event while no confirmation is active', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.IAMA] })
    const host = stubModal(wrapper)

    findModal(wrapper).element.dispatchEvent(new CustomEvent('close'))
    await nextTick()

    expect(host.hide).not.toHaveBeenCalled()
    expect(wrapper.emitted('startFresh')).toBeUndefined()
  })

  it('returns early in the dialog sync when the ref is missing (defensive guard)', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })
    ;(wrapper.vm as unknown as { freshDialog: HTMLElement | null }).freshDialog = null

    await clickButtonByText(wrapper, 'Start nieuwe DPIA')

    expect(findModal(wrapper).attributes('text')).toBe('Nieuwe DPIA starten?')
  })

  it('hides the modal on unmount', () => {
    const wrapper = mountLanding()
    const host = stubModal(wrapper)

    wrapper.unmount()

    expect(host.hide).toHaveBeenCalledTimes(1)
  })

  it('unmounts without crashing when the element is not upgraded or the ref is gone', () => {
    const plain = mountLanding()
    plain.unmount()

    const nulled = mountLanding()
    ;(nulled.vm as unknown as { freshDialog: HTMLElement | null }).freshDialog = null
    nulled.unmount()
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

describe('LandingView wis alle opgeslagen gegevens', () => {
  it('shows nothing when the browser holds no saved answers', () => {
    const wrapper = mountLanding({ cachedTypes: [] })
    expect(wrapper.text()).not.toContain('Opgeslagen gegevens wissen')
  })

  it('names the single assessment that has saved answers', () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })
    expect(wrapper.text()).toContain('antwoorden van je DPIA opgeslagen')
  })

  it('lists several assessments as a readable enumeration', () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA] })
    expect(wrapper.text()).toContain('Pre-scan, DPIA en IAMA')
  })

  it('emits clearAll only after the confirmation', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })

    await clickButtonByText(wrapper, 'Wis alle opgeslagen gegevens')
    expect(wrapper.emitted('clearAll')).toBeUndefined()
    const modal = findClearAllModal(wrapper)
    expect(modal.attributes('text')).toBe('Alle opgeslagen gegevens wissen?')
    expect(modal.attributes('supporting-text')).toContain('antwoorden van je DPIA uit deze browser')

    await clickButtonByText(wrapper, 'Ja, wis alles')
    expect(wrapper.emitted('clearAll')).toHaveLength(1)
  })

  it('cancels without emitting', async () => {
    const wrapper = mountLanding({ cachedTypes: [FormType.DPIA] })

    const host = findClearAllModal(wrapper).element as HTMLElement & { show?: () => void; hide?: () => void }
    host.show = vi.fn()
    host.hide = vi.fn()

    await clickButtonByText(wrapper, 'Wis alle opgeslagen gegevens')
    expect(host.show).toHaveBeenCalledTimes(1)

    await clickButtonByText(wrapper, 'Annuleren')

    expect(wrapper.emitted('clearAll')).toBeUndefined()
    expect(host.hide).toHaveBeenCalledTimes(1)
  })
})

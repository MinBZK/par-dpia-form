import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  FormType,
  useTaskStore,
  useAnswerStore,
  useSchemaStore,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import App from '../../src/App.vue'

const LandingStub = {
  name: 'LandingView',
  props: ['navigation', 'cachedTypes'],
  emits: ['startFresh'],
  template: '<div class="landing-stub" />',
}

function storageKey(ns: string): string {
  return `app_state_${ns}`
}

const FormStub = {
  name: 'Form',
  props: ['navigation', 'namespace', 'validData', 'autoStart', 'bannerTitle'],
  template: '<div class="form-stub" :data-namespace="namespace" />',
}

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        LandingView: LandingStub,
        Form: FormStub,
      },
    },
  })
}

describe('App.vue', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  it('renders the LandingView by default and not the Form', () => {
    const wrapper = mountApp()

    expect(wrapper.findComponent(LandingStub).exists()).toBe(true)
    expect(wrapper.findComponent(FormStub).exists()).toBe(false)

    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions
    expect(typeof nav.goToLanding).toBe('function')
    expect(typeof nav.goToDPIA).toBe('function')
    expect(typeof nav.goToPreScanDPIA).toBe('function')
    expect(typeof nav.goToIAMA).toBe('function')
  })

  it('navigates to the DPIA form via goToDPIA and configures the stores', async () => {
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    taskStore.isInitialized[FormType.DPIA] = true

    nav.goToDPIA()
    await wrapper.vm.$nextTick()

    expect(taskStore.activeNamespace).toBe(FormType.DPIA)
    expect(answerStore.activeNamespace).toBe(FormType.DPIA)
    expect(taskStore.isInitialized[FormType.DPIA]).toBe(false)

    expect(wrapper.findComponent(LandingStub).exists()).toBe(false)
    const form = wrapper.findComponent(FormStub)
    expect(form.exists()).toBe(true)
    expect(form.props('namespace')).toBe(FormType.DPIA)
    expect(form.props('validData')).toBeNull()
    // The "Invulhulpen" title is shown next to the logo on form pages too.
    expect(form.props('bannerTitle')).toBe('Invulhulpen')
  })

  it('navigates to the Pre-Scan DPIA form via goToPreScanDPIA and configures the stores', async () => {
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    taskStore.isInitialized[FormType.PRE_SCAN] = true

    nav.goToPreScanDPIA()
    await wrapper.vm.$nextTick()

    expect(taskStore.activeNamespace).toBe(FormType.PRE_SCAN)
    expect(answerStore.activeNamespace).toBe(FormType.PRE_SCAN)
    expect(taskStore.isInitialized[FormType.PRE_SCAN]).toBe(false)

    expect(wrapper.findComponent(LandingStub).exists()).toBe(false)
    const form = wrapper.findComponent(FormStub)
    expect(form.exists()).toBe(true)
    expect(form.props('namespace')).toBe(FormType.PRE_SCAN)
    expect(form.props('validData')).toBeNull()
  })

  it('navigates to the IAMA form via goToIAMA and configures the stores', async () => {
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    taskStore.isInitialized[FormType.IAMA] = true

    nav.goToIAMA!()
    await wrapper.vm.$nextTick()

    expect(taskStore.activeNamespace).toBe(FormType.IAMA)
    expect(answerStore.activeNamespace).toBe(FormType.IAMA)
    expect(taskStore.isInitialized[FormType.IAMA]).toBe(false)

    expect(wrapper.findComponent(LandingStub).exists()).toBe(false)
    const form = wrapper.findComponent(FormStub)
    expect(form.exists()).toBe(true)
    expect(form.props('namespace')).toBe(FormType.IAMA)
    expect(form.props('validData')).toBeNull()
  })

  it('returns to the LandingView via goToLanding', async () => {
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    nav.goToDPIA()
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(FormStub).exists()).toBe(true)

    nav.goToLanding()
    await wrapper.vm.$nextTick()

    expect(taskStore.activeNamespace).toBe(FormType.DPIA)
    expect(wrapper.findComponent(LandingStub).exists()).toBe(true)
    expect(wrapper.findComponent(FormStub).exists()).toBe(false)
  })
})

describe('App.vue — cached sessions (#322)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function seedCache(ns: FormType): void {
    localStorage.setItem(storageKey(ns), JSON.stringify({ answers: { '0.1': { value: 'X' } } }))
  }

  it('passes no cachedTypes to LandingView when localStorage is empty', () => {
    const wrapper = mountApp()
    const cached = wrapper.findComponent(LandingStub).props('cachedTypes') as FormType[]
    expect(cached).toEqual([])
  })

  it('detects cached assessments from localStorage on mount', () => {
    seedCache(FormType.DPIA)
    seedCache(FormType.IAMA)

    const wrapper = mountApp()
    const cached = wrapper.findComponent(LandingStub).props('cachedTypes') as FormType[]
    expect(cached).toEqual([FormType.DPIA, FormType.IAMA])
  })

  it('refreshes cachedTypes when returning to the landing page', async () => {
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    nav.goToDPIA()
    await wrapper.vm.$nextTick()

    // Saved progress appears while the form is open.
    seedCache(FormType.DPIA)

    nav.goToLanding()
    await wrapper.vm.$nextTick()

    const cached = wrapper.findComponent(LandingStub).props('cachedTypes') as FormType[]
    expect(cached).toEqual([FormType.DPIA])
  })

  it.each([
    [FormType.PRE_SCAN],
    [FormType.DPIA],
    [FormType.IAMA],
  ])('startFresh(%s) clears the saved state and opens a fresh form (no autoStart)', async (type) => {
    seedCache(type)
    const wrapper = mountApp()

    wrapper.findComponent(LandingStub).vm.$emit('startFresh', type)
    await wrapper.vm.$nextTick()

    expect(localStorage.getItem(storageKey(type))).toBeNull()
    const taskStore = useTaskStore()
    expect(taskStore.activeNamespace).toBe(type)
    const form = wrapper.findComponent(FormStub)
    expect(form.exists()).toBe(true)
    // Fresh start shows the intro/upload page, so the form is not auto-started.
    expect(form.props('autoStart')).toBe(false)
    expect(wrapper.findComponent(LandingStub).exists()).toBe(false)
  })

  it.each([
    [FormType.PRE_SCAN, 'goToPreScanDPIA'],
    [FormType.DPIA, 'goToDPIA'],
    [FormType.IAMA, 'goToIAMA'],
  ] as const)('resuming %s (cache present) auto-starts the form', async (type, navFn) => {
    seedCache(type)
    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions

    // "Verder gaan" simply navigates; saved state is still present.
    nav[navFn]!()
    await wrapper.vm.$nextTick()

    const form = wrapper.findComponent(FormStub)
    expect(form.exists()).toBe(true)
    expect(form.props('namespace')).toBe(type)
    expect(form.props('autoStart')).toBe(true)
  })
})

describe('App.vue — version pin on resume', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function seedVersioned(ns: FormType, urn: string): void {
    localStorage.setItem(storageKey(ns), JSON.stringify({
      metadata: { urn },
      answers: { '0.1': { value: 'X' } },
    }))
  }

  it('activates the saved version on resume and shows no warning when it is bundled', async () => {
    seedVersioned(FormType.DPIA, 'urn:nl:dpia:3.0')
    const activatePin = vi.spyOn(useSchemaStore(), 'activatePin').mockReturnValue({ fellBack: false })

    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions
    nav.goToDPIA()
    await wrapper.vm.$nextTick()

    expect(activatePin).toHaveBeenCalledWith(FormType.DPIA, '3.0')
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })

  it('warns without blocking when the saved version is not bundled (fellBack)', async () => {
    seedVersioned(FormType.IAMA, 'urn:nl:iama:1.9')
    vi.spyOn(useSchemaStore(), 'activatePin').mockReturnValue({ fellBack: true })

    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions
    nav.goToIAMA!()
    await wrapper.vm.$nextTick()

    const warning = wrapper.find('.rvo-alert--warning')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('1.9')
    // Non-blocking: the form still renders.
    expect(wrapper.findComponent(FormStub).exists()).toBe(true)
  })

  it('clears the warning when returning to the landing page', async () => {
    seedVersioned(FormType.DPIA, 'urn:nl:dpia:2.9')
    vi.spyOn(useSchemaStore(), 'activatePin').mockReturnValue({ fellBack: true })

    const wrapper = mountApp()
    const nav = wrapper.findComponent(LandingStub).props('navigation') as NavigationFunctions
    nav.goToDPIA()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(true)

    nav.goToLanding()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.rvo-alert--warning').exists()).toBe(false)
  })
})

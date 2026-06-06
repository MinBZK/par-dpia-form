import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  FormType,
  useTaskStore,
  useAnswerStore,
  type NavigationFunctions,
} from '@overheid-assessment/core'
import App from '../../src/App.vue'

const LandingStub = {
  name: 'LandingView',
  props: ['navigation'],
  template: '<div class="landing-stub" />',
}

const FormStub = {
  name: 'Form',
  props: ['navigation', 'namespace', 'validData'],
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

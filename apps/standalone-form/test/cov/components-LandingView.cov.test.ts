import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { NavigationFunctions } from '@overheid-assessment/core'
import LandingView from '@/components/LandingView.vue'

function makeNavigation(): NavigationFunctions {
  return {
    goToLanding: vi.fn(),
    goToDPIA: vi.fn(),
    goToPreScanDPIA: vi.fn(),
  }
}

describe('LandingView rendering', () => {
  it('renders the page heading and the AppBanner', () => {
    const wrapper = mount(LandingView, { props: { navigation: makeNavigation() } })

    expect(wrapper.find('h1.utrecht-heading-1').text()).toBe(
      'Invulhulp voor pre-scan en DPIA',
    )
    expect(wrapper.findComponent({ name: 'AppBanner' }).exists()).toBe(true)
  })

  it('renders the two assessment cards with their Dutch descriptions', () => {
    const wrapper = mount(LandingView, { props: { navigation: makeNavigation() } })

    const headings = wrapper.findAll('h2.utrecht-heading-2').map((h) => h.text())
    expect(headings).toContain('Pre-scan')
    expect(headings).toContain('DPIA')

    expect(wrapper.text()).toContain('Toets of een DPIA, DTIA, IAMA of KIA nodig is.')
    expect(wrapper.text()).toContain('Vul stap voor stap het rijksmodel DPIA in.')
  })

  it('renders both start buttons with the correct Dutch labels', () => {
    const wrapper = mount(LandingView, { props: { navigation: makeNavigation() } })

    const buttonLabels = wrapper
      .findAll('button.card-button')
      .map((b) => b.text())
    expect(buttonLabels).toEqual(['Start pre-scan', 'Start DPIA'])
  })

  it('renders the informational save-and-share card', () => {
    const wrapper = mount(LandingView, { props: { navigation: makeNavigation() } })

    expect(wrapper.text()).toContain('Opslaan en delen van je DPIA')
    expect(wrapper.find('.rvo-status-icon-info').attributes('aria-label')).toBe(
      'Info',
    )
  })
})

describe('LandingView navigation interaction', () => {
  it('calls navigation.goToPreScanDPIA when the pre-scan button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mount(LandingView, { props: { navigation } })

    const buttons = wrapper.findAll('button.card-button')
    await buttons[0].trigger('click')

    expect(navigation.goToPreScanDPIA).toHaveBeenCalledTimes(1)
    expect(navigation.goToDPIA).not.toHaveBeenCalled()
    expect(navigation.goToLanding).not.toHaveBeenCalled()
  })

  it('calls navigation.goToDPIA when the DPIA button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mount(LandingView, { props: { navigation } })

    const buttons = wrapper.findAll('button.card-button')
    await buttons[1].trigger('click')

    expect(navigation.goToDPIA).toHaveBeenCalledTimes(1)
    expect(navigation.goToPreScanDPIA).not.toHaveBeenCalled()
    expect(navigation.goToLanding).not.toHaveBeenCalled()
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBanner from '../../src/components/AppBanner.vue'

// The banner is a thin composition of nldd-status-bar (persistent beta
// status, static text only) and nldd-top-navigation-bar (Rijksoverheid logo
// + wordmark, stubbed in jsdom), so tests assert on host attributes and slot
// passthrough.

describe('AppBanner default props', () => {
  it('renders the static beta status bar with the default Dutch text', () => {
    const wrapper = mount(AppBanner)

    const bar = wrapper.find('nldd-status-bar')
    expect(bar.attributes('variant')).toBe('warning')
    expect(bar.attributes('text')).toBe(
      'Bètaversie - Invulhulpen is in ontwikkeling en kan fouten bevatten',
    )
    expect(bar.attributes('href')).toBeUndefined()
  })

  it('renders the top navigation bar with the default wordmark and home url', () => {
    const wrapper = mount(AppBanner)
    const bar = wrapper.find('nldd-top-navigation-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('logo-title')).toBe('Invulhulpen')
    expect(bar.attributes('logo-subtitle')).toBe('Pre-scan, DPIA en IAMA')
    expect(bar.attributes('logo-href')).toBe('#')
  })
})

describe('AppBanner custom props', () => {
  it('overrides message, linkLabel, title, subtitle and homeUrl', () => {
    const wrapper = mount(AppBanner, {
      props: {
        message: 'Eigen melding.',
        linkLabel: 'Meer informatie',
        title: 'Pre-scan',
        subtitle: 'Alleen ondertitel',
        homeUrl: '/start',
      },
    })

    const statusBar = wrapper.find('nldd-status-bar')
    expect(statusBar.attributes('text')).toBe('Meer informatie - Eigen melding.')

    const bar = wrapper.find('nldd-top-navigation-bar')
    expect(bar.attributes('logo-title')).toBe('Pre-scan')
    expect(bar.attributes('logo-subtitle')).toBe('Alleen ondertitel')
    expect(bar.attributes('logo-href')).toBe('/start')
  })

  it('passes the global and utility slots through into the navigation bar', () => {
    const wrapper = mount(AppBanner, {
      slots: {
        global: '<nav id="global-menu">Projecten</nav>',
        utility: '<nav id="utility-menu">Account</nav>',
      },
    })

    const bar = wrapper.find('nldd-top-navigation-bar')
    expect(bar.find('#global-menu').text()).toBe('Projecten')
    expect(bar.find('#utility-menu').text()).toBe('Account')
  })
})

describe('AppBanner back button', () => {
  it('renders no back-text attribute by default', () => {
    const wrapper = mount(AppBanner)
    const bar = wrapper.find('nldd-top-navigation-bar')
    expect(bar.attributes('back-text')).toBeUndefined()
  })

  it('passes backText through as the back-text attribute on the bar', () => {
    const wrapper = mount(AppBanner, { props: { backText: 'Terug naar overzicht' } })
    const bar = wrapper.find('nldd-top-navigation-bar')
    expect(bar.attributes('back-text')).toBe('Terug naar overzicht')
  })

  it('emits back when the navigation bar fires back-click', async () => {
    const wrapper = mount(AppBanner, { props: { backText: 'Terug naar overzicht' } })

    await wrapper.find('nldd-top-navigation-bar').trigger('back-click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBanner from '../../src/components/AppBanner.vue'

describe('AppBanner default props', () => {
  it('renders the default Dutch warning message, link label and link url', () => {
    const wrapper = mount(AppBanner)

    const text = wrapper.find('.rvo-alert-text')
    expect(text.text()).toContain('De invulhulp DPIA is in ontwikkeling.')

    const link = text.find('a.rvo-link')
    expect(link.text()).toBe('Bètaversie')
    expect(link.attributes('href')).toBe('https://github.com/MinBZK/par-dpia-form')
  })

  it('points the logo link at the default home url "#"', () => {
    const wrapper = mount(AppBanner)
    const logoLink = wrapper.find('a.rvo-header__logo-link')
    expect(logoLink.attributes('href')).toBe('#')
  })

  it('does not render the title paragraph when title defaults to an empty string (v-if false)', () => {
    const wrapper = mount(AppBanner)
    expect(wrapper.find('.rvo-logo__title').exists()).toBe(false)
  })

  it('renders the warning icon and the Rijksoverheid logo svg', () => {
    const wrapper = mount(AppBanner)
    const icon = wrapper.find('.rvo-icon-waarschuwing')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('aria-label')).toBe('Waarschuwing')
    expect(wrapper.find('svg title').text()).toBe('Logo Rijksoverheid')
  })
})

describe('AppBanner custom props', () => {
  it('renders the title paragraph when a non-empty title is provided (v-if true)', () => {
    const wrapper = mount(AppBanner, { props: { title: 'Pre-scan' } })
    const title = wrapper.find('.rvo-logo__title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('Pre-scan')
  })

  it('overrides message, linkUrl, linkLabel and homeUrl', () => {
    const wrapper = mount(AppBanner, {
      props: {
        message: 'Eigen melding.',
        linkUrl: 'https://example.test/info',
        linkLabel: 'Meer informatie',
        homeUrl: '/start',
      },
    })

    const text = wrapper.find('.rvo-alert-text')
    expect(text.text()).toContain('Eigen melding.')

    const link = text.find('a.rvo-link')
    expect(link.text()).toBe('Meer informatie')
    expect(link.attributes('href')).toBe('https://example.test/info')

    expect(wrapper.find('a.rvo-header__logo-link').attributes('href')).toBe('/start')
  })
})

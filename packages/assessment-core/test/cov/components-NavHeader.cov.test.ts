import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NavHeader from '../../src/components/NavHeader.vue'
import type { NavigationFunctions } from '../../src/models/navigation'

function makeNavigation(): NavigationFunctions {
  return {
    goToLanding: vi.fn(),
    goToDPIA: vi.fn(),
    goToPreScanDPIA: vi.fn(),
  }
}

describe('NavHeader rendering', () => {
  it('renders the back-to-overview button with the Dutch label and back icon', () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, { props: { navigation } })

    const button = wrapper.find('button.rvo-button--tertiary')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Terug naar overzicht')

    const icon = wrapper.find('.rvo-icon-terug')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('role')).toBe('img')
    expect(icon.attributes('aria-label')).toBe('Terug')
  })

  it('renders the horizontal-rule menubar background container', () => {
    const wrapper = mount(NavHeader, { props: { navigation: makeNavigation() } })
    expect(
      wrapper.find('.rvo-menubar__background--horizontal-rule').exists(),
    ).toBe(true)
    expect(wrapper.find('button.rvo-button').exists()).toBe(true)
  })
})

describe('NavHeader navigation interaction', () => {
  it('calls navigation.goToLanding when the button is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, { props: { navigation } })

    await wrapper.find('button.rvo-button--tertiary').trigger('click')

    expect(navigation.goToLanding).toHaveBeenCalledTimes(1)
    expect(navigation.goToPreScanDPIA).not.toHaveBeenCalled()
    expect(navigation.goToDPIA).not.toHaveBeenCalled()
  })

  it('renders the action slot on the right of the bar', () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, {
      props: { navigation },
      slots: { default: '<span class="slot-marker">actie</span>' },
    })

    expect(wrapper.find('.slot-marker').exists()).toBe(true)
  })
})

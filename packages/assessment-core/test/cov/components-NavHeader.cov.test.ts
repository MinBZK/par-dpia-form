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
  it('renders the back-to-overview link with the Dutch label and back icon', () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, { props: { navigation } })

    const link = wrapper.find('a.rvo-menubar__link')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('Terug naar overzicht')

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
    expect(wrapper.find('nav.rvo-menubar').exists()).toBe(true)
  })
})

describe('NavHeader navigation interaction', () => {
  it('calls navigation.goToLanding when the link is clicked', async () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, { props: { navigation } })

    await wrapper.find('a.rvo-menubar__link').trigger('click')

    expect(navigation.goToLanding).toHaveBeenCalledTimes(1)
    expect(navigation.goToPreScanDPIA).not.toHaveBeenCalled()
    expect(navigation.goToDPIA).not.toHaveBeenCalled()
  })

  it('prevents the default anchor navigation on click (@click.prevent)', async () => {
    const navigation = makeNavigation()
    const wrapper = mount(NavHeader, { props: { navigation } })

    const event = new MouseEvent('click', { cancelable: true, bubbles: true })
    wrapper.find('a.rvo-menubar__link').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(navigation.goToLanding).toHaveBeenCalledTimes(1)
  })
})

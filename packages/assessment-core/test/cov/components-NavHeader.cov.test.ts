import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NavHeader from '../../src/components/NavHeader.vue'

// NavHeader is only the actions bar under the app header; back navigation
// moved into the top navigation bar (AppBanner).

describe('NavHeader rendering', () => {
  it('renders the bar structure without a built-in back button', () => {
    const wrapper = mount(NavHeader)

    expect(wrapper.find('.nav-header').exists()).toBe(true)
    expect(wrapper.find('.nav-header__bar').exists()).toBe(true)
    expect(wrapper.find('.nav-header__actions').exists()).toBe(true)
    expect(wrapper.find('nldd-button').exists()).toBe(false)
  })

  it('renders slot content inside the actions area', () => {
    const wrapper = mount(NavHeader, {
      slots: { default: '<span class="slot-marker">actie</span>' },
    })

    expect(wrapper.find('.nav-header__actions .slot-marker').text()).toBe('actie')
  })
})

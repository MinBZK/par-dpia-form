import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeMenuItems from '../../src/components/ThemeMenuItems.vue'
import { resetThemeForTesting } from '../../src/composables/useTheme'

// The items are radio nldd-menu-items meant to live inside a host nldd-menu
// (the account menu); nldd elements are stubbed in jsdom, so tests assert on
// host attributes and drive select events by hand.

function rootColorScheme(): string {
  return document.documentElement.style.getPropertyValue('color-scheme')
}

describe('ThemeMenuItems.vue', () => {
  beforeEach(() => {
    resetThemeForTesting()
    localStorage.clear()
    document.documentElement.style.removeProperty('color-scheme')
  })

  it('renders the three radio options with Dutch labels, icons and the current selection', () => {
    const wrapper = mount(ThemeMenuItems)

    const items = wrapper.findAll('nldd-menu-item')
    expect(items.map((i) => i.attributes('text'))).toEqual(['Systeem', 'Licht', 'Donker'])
    expect(items.map((i) => i.attributes('icon'))).toEqual(['display', 'light-mode', 'dark-mode'])
    expect(items.map((i) => i.attributes('type'))).toEqual(['radio', 'radio', 'radio'])
    // Default preference is auto, so only Systeem is selected.
    expect(items.map((i) => i.attributes('selected'))).toEqual(['true', undefined, undefined])
  })

  it('applies, persists and re-marks the selection on select', async () => {
    const wrapper = mount(ThemeMenuItems)

    const donker = wrapper.findAll('nldd-menu-item')[2]
    await donker.trigger('select')

    expect(rootColorScheme()).toBe('dark')
    expect(localStorage.getItem('invulhulpen-theme')).toBe('dark')
    expect(wrapper.findAll('nldd-menu-item').map((i) => i.attributes('selected')))
      .toEqual([undefined, undefined, 'true'])
  })

  it('clears the override again when Systeem is chosen', async () => {
    localStorage.setItem('invulhulpen-theme', 'light')
    const wrapper = mount(ThemeMenuItems)

    await wrapper.findAll('nldd-menu-item')[0].trigger('select')

    expect(rootColorScheme()).toBe('')
    expect(localStorage.getItem('invulhulpen-theme')).toBe('auto')
  })
})

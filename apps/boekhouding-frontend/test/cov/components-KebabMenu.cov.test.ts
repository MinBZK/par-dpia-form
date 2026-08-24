/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KebabMenu from '../../src/components/KebabMenu.vue'

function mountMenu() {
  return mount(KebabMenu, {
    props: { label: 'Projectacties' },
    attachTo: document.body,
    slots: {
      default: '<nldd-menu-item text="Project verwijderen" class="item-stub"></nldd-menu-item>',
    },
  })
}

describe('KebabMenu', () => {
  it('renders the trigger with the accessible label and menu popup semantics', () => {
    const wrapper = mountMenu()

    const trigger = wrapper.find('nldd-icon-button')
    // The icon comes through the slot, not the attribute, so it can be turned
    // upright: NLDD ships no vertical ellipsis.
    expect(trigger.attributes('icon')).toBeUndefined()
    const icon = trigger.find('nldd-icon[slot="icon"]')
    expect(icon.attributes('name')).toBe('ellipsis')
    expect(icon.classes()).toContain('kebab-menu__icon')
    expect(trigger.attributes('text')).toBe('Projectacties')
    expect(trigger.attributes('variant')).toBe('neutral-transparent')
    expect(trigger.attributes('size')).toBe('sm')
    expect(trigger.attributes('popup-type')).toBe('menu')

    wrapper.unmount()
  })

  it('slots the menu into the trigger popup slot so NLDD anchors and toggles it', () => {
    const wrapper = mountMenu()

    const menu = wrapper.find('nldd-icon-button > nldd-menu')
    expect(menu.exists()).toBe(true)
    expect(menu.attributes('slot')).toBe('popup')
    expect(menu.attributes('accessible-label')).toBe('Projectacties')
    // No manual wiring left: the popup slot owns anchoring and expanded state.
    expect(menu.attributes('anchor')).toBeUndefined()
    expect(wrapper.find('nldd-icon-button').attributes('expanded')).toBeUndefined()
    expect(menu.find('.item-stub').exists()).toBe(true)

    wrapper.unmount()
  })
})

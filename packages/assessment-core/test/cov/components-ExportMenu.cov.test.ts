import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ExportMenu from '../../src/components/ExportMenu.vue'

// The nldd-* custom elements are not registered in jsdom (every
// @nldd/design-system import resolves to an empty stub), so the hosts render
// as inert elements: tests assert on host attributes and slot nesting and
// simulate the NLDD events (action-click) with dispatched events.

// Under a trigger that already says "Exporteer" the items only name the format;
// the split button's menu hangs off the chevron, so there they spell it out.
const MENU_ITEM_TEXTS = ['PDF', 'JSON', 'Markdown']
const SPLIT_ITEM_TEXTS = ['Exporteer als PDF', 'Exporteer als JSON', 'Exporteer als Markdown']

// nldd-menu-item fires `select` (not a bare click) when it is activated.
const select = (item: { element: Element }) =>
  item.element.dispatchEvent(new CustomEvent('select', { bubbles: true }))

describe('ExportMenu.vue compacte variant (zonder split)', () => {
  it('rendert een expandable "Exporteer"-knop met het menu in de popup-slot', () => {
    const wrapper = mount(ExportMenu, { attachTo: document.body })

    const button = wrapper.find('nldd-button')
    expect(button.exists()).toBe(true)
    expect(button.attributes('text')).toBe('Exporteer')
    expect(button.attributes('variant')).toBe('accent-transparent')
    expect(button.attributes('size')).toBe('xs')
    expect(button.attributes('expandable')).toBeDefined()
    expect(button.attributes('popup-type')).toBe('menu')
    // Anchoring, toggling and `expanded` are the button's job for a slotted
    // menu: no manual id/anchor/popovertarget wiring remains.
    expect(button.attributes('id')).toBeUndefined()
    expect(button.attributes('expanded')).toBeUndefined()

    const menu = button.find('nldd-menu')
    expect(menu.exists()).toBe(true)
    expect(menu.attributes('slot')).toBe('popup')
    expect(menu.attributes('anchor')).toBeUndefined()
    // nldd-menu has no accessible-label; the menu takes its name from the
    // button that opens it, so setting one here would be silently ignored.
    expect(menu.attributes('accessible-label')).toBeUndefined()
    const items = menu.findAll('nldd-menu-item')
    expect(items.map((item) => item.attributes('text'))).toEqual(MENU_ITEM_TEXTS)

    expect(wrapper.find('nldd-split-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emit export met het gekozen formaat per menu-item (menu sluit zichzelf via light-dismiss)', async () => {
    const wrapper = mount(ExportMenu, { attachTo: document.body })

    const items = wrapper.findAll('nldd-menu-item')
    items.forEach(select)
    await nextTick()

    expect(wrapper.emitted('export')).toEqual([['pdf'], ['json'], ['markdown']])
    wrapper.unmount()
  })
})

describe('ExportMenu.vue split-variant', () => {
  it('rendert een secondary split-button met het menu als slot-inhoud, zonder aparte knop', () => {
    const wrapper = mount(ExportMenu, { props: { split: true } })

    const splitButton = wrapper.find('nldd-split-button')
    expect(splitButton.exists()).toBe(true)
    expect(splitButton.attributes('variant')).toBe('secondary')
    expect(splitButton.attributes('text')).toBe('Exporteer als PDF')

    expect(splitButton.find('nldd-menu').attributes('accessible-label')).toBeUndefined()
    const items = splitButton.findAll('nldd-menu-item')
    expect(items.map((item) => item.attributes('text'))).toEqual(SPLIT_ITEM_TEXTS)

    // The compact standalone button is not rendered in split mode.
    expect(wrapper.find('nldd-button').exists()).toBe(false)
  })

  it('emit export "pdf" bij het action-click-event van de hoofdknop', async () => {
    const wrapper = mount(ExportMenu, { props: { split: true } })

    wrapper.find('nldd-split-button').element.dispatchEvent(new CustomEvent('action-click'))
    await nextTick()

    expect(wrapper.emitted('export')).toEqual([['pdf']])
  })

  it('emit per menu-item het bijbehorende formaat in de split-variant', async () => {
    const wrapper = mount(ExportMenu, { props: { split: true } })

    const items = wrapper.findAll('nldd-menu-item')
    items.forEach(select)
    await nextTick()

    expect(wrapper.emitted('export')).toEqual([['pdf'], ['json'], ['markdown']])
  })

  it('rendert als item in de utility menu-balk met dezelfde exportopties', () => {
    const wrapper = mount(ExportMenu, { props: { menuBar: true } })

    const item = wrapper.find('nldd-menu-bar-item')
    expect(item.attributes('text')).toBe('Exporteer')
    expect(item.attributes('icon')).toBe('download')
    expect(item.attributes('expandable')).toBeDefined()
    expect(item.find('nldd-menu').attributes('accessible-label')).toBeUndefined()
    expect(item.findAll('nldd-menu-item').map((i) => i.attributes('text'))).toEqual(MENU_ITEM_TEXTS)

    // Neither of the other two hosts renders alongside it.
    expect(wrapper.find('nldd-split-button').exists()).toBe(false)
    expect(wrapper.find('nldd-button').exists()).toBe(false)
  })

  it('emit per menu-item het bijbehorende formaat in de menu-balk-variant', async () => {
    const wrapper = mount(ExportMenu, { props: { menuBar: true } })

    const items = wrapper.findAll('nldd-menu-item')
    items.forEach(select)
    await nextTick()

    expect(wrapper.emitted('export')).toEqual([['pdf'], ['json'], ['markdown']])
  })
})

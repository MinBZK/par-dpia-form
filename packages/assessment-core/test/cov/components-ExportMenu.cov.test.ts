import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportMenu from '../../src/components/ExportMenu.vue'

// The outside-click listener is registered via setTimeout(..., 0); use fake
// timers where needed so we can flush that deferred registration deterministically.
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mountMenu() {
  // attachTo document so focus() and dispatched document events behave realistically.
  return mount(ExportMenu, { attachTo: document.body })
}

describe('ExportMenu.vue', () => {
  it('renders the trigger collapsed with aria-expanded=false and no panel', () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('button')
    expect(trigger.text()).toContain('Exporteer')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the panel and sets aria-expanded=true when the trigger is clicked', async () => {
    const wrapper = mountMenu()
    await wrapper.find('button').trigger('click')

    expect(wrapper.find('.export-menu__panel').exists()).toBe(true)
    expect(wrapper.find('button[aria-expanded]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.export-menu__item')).toHaveLength(3)
    wrapper.unmount()
  })

  it('toggles closed again on a second trigger click', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('button')

    await trigger.trigger('click')
    expect(wrapper.find('.export-menu__panel').exists()).toBe(true)

    await trigger.trigger('click')
    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('emits "export" with the chosen format and closes the panel', async () => {
    const wrapper = mountMenu()
    await wrapper.find('button').trigger('click')

    const items = wrapper.findAll('.export-menu__item')
    await items[0].trigger('click') // pdf
    expect(wrapper.emitted('export')![0]).toEqual(['pdf'])
    // choosing closes the menu
    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    await wrapper.findAll('.export-menu__item')[1].trigger('click') // json
    expect(wrapper.emitted('export')![1]).toEqual(['json'])

    await wrapper.find('button').trigger('click')
    await wrapper.findAll('.export-menu__item')[2].trigger('click') // markdown
    expect(wrapper.emitted('export')![2]).toEqual(['markdown'])
    wrapper.unmount()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('button')
    await trigger.trigger('click')
    expect(wrapper.find('.export-menu__panel').exists()).toBe(true)

    await wrapper.find('.export-menu').trigger('keydown.escape')

    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('ignores Escape when the menu is already closed (early return)', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.export-menu').trigger('keydown.escape')
    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
    expect(wrapper.emitted('export')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes when a click lands outside the menu container', async () => {
    vi.useFakeTimers()
    const wrapper = mountMenu()
    await wrapper.find('button').trigger('click')
    // Flush the deferred addOutsideListener so the document listener is active.
    vi.runAllTimers()

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
    outside.remove()
    wrapper.unmount()
  })

  it('does NOT close when a click lands inside the menu container', async () => {
    vi.useFakeTimers()
    const wrapper = mountMenu()
    await wrapper.find('button').trigger('click')
    vi.runAllTimers()

    // A click whose target is inside containerRef must not close the menu.
    // Use the panel container (non-interactive) so we exercise the
    // contains()-true branch without triggering an item's choose() handler.
    const panel = wrapper.find('.export-menu__panel').element as HTMLElement
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.export-menu__panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it('handleDocumentClick is a no-op once the container ref is gone after unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mountMenu()
    await wrapper.find('button').trigger('click')
    vi.runAllTimers()

    const removeSpy = vi.spyOn(document, 'removeEventListener')
    wrapper.unmount()
    // onBeforeUnmount removes the listener.
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function))
  })

  describe('split mode', () => {
    function mountSplit() {
      return mount(ExportMenu, { props: { split: true }, attachTo: document.body })
    }

    it('renders a main "Exporteer als PDF" button and a chevron toggle', () => {
      const wrapper = mountSplit()
      const main = wrapper.find('.export-menu__split-main')
      const toggle = wrapper.find('.export-menu__split-toggle')
      expect(main.exists()).toBe(true)
      expect(main.text()).toBe('Exporteer als PDF')
      expect(toggle.exists()).toBe(true)
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
      wrapper.unmount()
    })

    it('exports PDF directly from the main button without opening the panel', async () => {
      const wrapper = mountSplit()
      await wrapper.find('.export-menu__split-main').trigger('click')

      expect(wrapper.emitted('export')![0]).toEqual(['pdf'])
      // The panel was never opened: choose() -> close() short-circuits on the
      // already-closed state.
      expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
      expect(wrapper.find('.export-menu__split-toggle').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    it('opens all export options via the chevron toggle', async () => {
      const wrapper = mountSplit()
      await wrapper.find('.export-menu__split-toggle').trigger('click')

      expect(wrapper.find('.export-menu__panel').exists()).toBe(true)
      const items = wrapper.findAll('.export-menu__item')
      expect(items).toHaveLength(3)

      await items[1].trigger('click') // json
      expect(wrapper.emitted('export')![0]).toEqual(['json'])
      expect(wrapper.find('.export-menu__panel').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})

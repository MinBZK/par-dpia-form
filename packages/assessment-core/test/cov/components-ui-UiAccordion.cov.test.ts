import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UiAccordion from '../../src/components/ui/UiAccordion.vue'

function mountAccordion(props: { open?: boolean } = {}) {
  return mount(UiAccordion, {
    props,
    slots: {
      title: '<h3>Kop</h3>',
      default: '<p>Inhoud</p>',
    },
  })
}

describe('UiAccordion structure', () => {
  it('renders a native details with summary and content containers', () => {
    const wrapper = mountAccordion()
    const details = wrapper.find('details.ui-accordion')
    expect(details.exists()).toBe(true)
    expect(details.find('summary.ui-accordion__summary').exists()).toBe(true)
    expect(details.find('div.ui-accordion__content').exists()).toBe(true)
  })

  it('renders both chevron icons inside an aria-hidden icon span', () => {
    const wrapper = mountAccordion()
    const iconSpan = wrapper.find('summary span.ui-accordion__icon')
    expect(iconSpan.exists()).toBe(true)
    expect(iconSpan.attributes('aria-hidden')).toBe('true')

    // nldd-icon stays an unregistered custom element in jsdom; assert on the
    // host attributes rather than rendered text.
    const icons = iconSpan.findAll('nldd-icon')
    expect(icons).toHaveLength(2)
    expect(icons[0].attributes('name')).toBe('chevron-down')
    expect(icons[0].classes()).toContain('ui-accordion__icon--closed')
    expect(icons[1].attributes('name')).toBe('chevron-up')
    expect(icons[1].classes()).toContain('ui-accordion__icon--open')
    for (const icon of icons) {
      expect(icon.attributes('size')).toBe('20')
      expect(icon.attributes('color')).toBe('accent')
    }
  })
})

describe('UiAccordion slots', () => {
  it('renders the title slot inside the summary title span', () => {
    const wrapper = mountAccordion()
    const title = wrapper.find('summary span.ui-accordion__title')
    expect(title.exists()).toBe(true)
    expect(title.find('h3').text()).toBe('Kop')
  })

  it('renders the default slot inside the content container', () => {
    const wrapper = mountAccordion()
    expect(wrapper.find('.ui-accordion__content p').text()).toBe('Inhoud')
  })
})

describe('UiAccordion open prop', () => {
  it('is closed by default when the open prop is absent', () => {
    const wrapper = mountAccordion()
    expect((wrapper.find('details').element as HTMLDetailsElement).open).toBe(false)
  })

  it('binds the open prop to the native open attribute of details', async () => {
    const wrapper = mountAccordion({ open: true })
    expect((wrapper.find('details').element as HTMLDetailsElement).open).toBe(true)

    await wrapper.setProps({ open: false })
    expect((wrapper.find('details').element as HTMLDetailsElement).open).toBe(false)
  })
})

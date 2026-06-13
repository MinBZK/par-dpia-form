import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UiButton from '../../src/components/ui/UiButton.vue'

describe('UiButton variantClass computed', () => {
  it('uses primary-action by default when no variant is given', () => {
    const wrapper = mount(UiButton)
    const button = wrapper.find('button')
    expect(button.classes()).toContain('utrecht-button')
    expect(button.classes()).toContain('utrecht-button--primary-action')
  })

  it('uses primary-action when variant is explicitly primary', () => {
    const wrapper = mount(UiButton, { props: { variant: 'primary' } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--primary-action')
  })

  it('uses secondary-action for the secondary variant', () => {
    const wrapper = mount(UiButton, { props: { variant: 'secondary' } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--secondary-action')
  })

  it('uses rvo tertiary-action for the tertiary variant', () => {
    const wrapper = mount(UiButton, { props: { variant: 'tertiary' } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--rvo-tertiary-action')
  })

  it('uses rvo quaternary-action for the quaternary variant', () => {
    const wrapper = mount(UiButton, { props: { variant: 'quaternary' } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--rvo-quaternary-action')
  })

  it('uses primary-action plus warning modifier for the warning variant', () => {
    const wrapper = mount(UiButton, { props: { variant: 'warning' } })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('utrecht-button--primary-action')
    expect(classes).toContain('utrecht-button--warning')
  })
})

describe('UiButton size class', () => {
  it('defaults to rvo-md size when no size prop is given', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.find('button').classes()).toContain('utrecht-button--rvo-md')
  })

  it('applies the given size', () => {
    const wrapper = mount(UiButton, { props: { size: 'xs' } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--rvo-xs')
  })
})

describe('UiButton fullWidth', () => {
  it('does not add the full-width class by default', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.find('button').classes()).not.toContain('utrecht-button--rvo-full-width')
  })

  it('adds the full-width class when fullWidth is true', () => {
    const wrapper = mount(UiButton, { props: { fullWidth: true } })
    expect(wrapper.find('button').classes()).toContain('utrecht-button--rvo-full-width')
  })
})

describe('UiButton type attribute', () => {
  it('defaults the button type to "button"', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.find('button').attributes('type')).toBe('button')
  })

  it('applies the given type', () => {
    const wrapper = mount(UiButton, { props: { type: 'submit' } })
    expect(wrapper.find('button').attributes('type')).toBe('submit')
  })
})

describe('UiButton disabled and aria attributes', () => {
  it('is not disabled and exposes no aria-disabled by default', () => {
    const wrapper = mount(UiButton)
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-disabled')).toBeUndefined()
  })

  it('sets disabled and aria-disabled when disabled is true', () => {
    const wrapper = mount(UiButton, { props: { disabled: true } })
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-disabled')).toBe('true')
  })

  it('prefers ariaLabel over label for the aria-label attribute', () => {
    const wrapper = mount(UiButton, { props: { ariaLabel: 'Sluiten', label: 'Annuleren' } })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Sluiten')
  })

  it('falls back to label for the aria-label attribute when ariaLabel is absent', () => {
    const wrapper = mount(UiButton, { props: { label: 'Annuleren' } })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Annuleren')
  })
})

describe('UiButton icon and label rendering (showIconAfter=false branch)', () => {
  it('renders the label text without an icon by default', () => {
    const wrapper = mount(UiButton, { props: { label: 'Opslaan' } })
    expect(wrapper.text()).toContain('Opslaan')
    expect(wrapper.find('.rvo-icon').exists()).toBe(false)
  })

  it('renders an empty label when no label is provided', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.text()).toBe('')
    expect(wrapper.find('.rvo-icon').exists()).toBe(false)
  })

  it('renders the icon before the label with the spacing-right modifier', () => {
    const wrapper = mount(UiButton, { props: { icon: 'pijl-naar-rechts', label: 'Verder' } })
    const icon = wrapper.find('.rvo-icon')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('rvo-icon-pijl-naar-rechts')
    expect(icon.classes()).toContain('rvo-icon--with-spacing-right')
    expect(icon.attributes('role')).toBe('img')
    expect(wrapper.text()).toContain('Verder')
  })
})

describe('UiButton icon and label rendering (showIconAfter=true branch)', () => {
  it('renders the label span first and no icon when icon is absent', () => {
    const wrapper = mount(UiButton, { props: { showIconAfter: true, label: 'Volgende' } })
    expect(wrapper.find('span').html()).toContain('Volgende')
    expect(wrapper.find('.rvo-icon').exists()).toBe(false)
  })

  it('renders an empty label span when showIconAfter is true and no label is provided', () => {
    const wrapper = mount(UiButton, { props: { showIconAfter: true } })
    expect(wrapper.find('span').exists()).toBe(true)
    expect(wrapper.find('.rvo-icon').exists()).toBe(false)
  })

  it('renders the icon after the label with the spacing-left modifier', () => {
    const wrapper = mount(UiButton, {
      props: { showIconAfter: true, icon: 'pijl-naar-links', label: 'Terug' },
    })
    const icon = wrapper.find('.rvo-icon')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('rvo-icon-pijl-naar-links')
    expect(icon.classes()).toContain('rvo-icon--with-spacing-left')
    expect(icon.attributes('aria-label')).toBe('icon')
    expect(wrapper.find('span').html()).toContain('Terug')
  })
})

describe('UiButton click event', () => {
  it('emits a click event carrying the original MouseEvent', async () => {
    const wrapper = mount(UiButton, { props: { label: 'Klik' } })
    await wrapper.find('button').trigger('click')
    const emitted = wrapper.emitted('click')
    expect(emitted).toBeTruthy()
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toBeInstanceOf(MouseEvent)
  })
})

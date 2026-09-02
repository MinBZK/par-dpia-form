/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import NotFound from '../../src/views/NotFound.vue'

describe('NotFound.vue', () => {
  it('renders the 404 heading and explanation', () => {
    const wrapper = mount(NotFound)
    expect(wrapper.find('h1').text()).toBe('Pagina niet gevonden')
    expect(wrapper.text()).toContain('bestaat niet')
  })

  it('links back to the start page via an nldd-button with href', () => {
    const wrapper = mount(NotFound)
    const button = wrapper.find('nldd-button')
    expect(button.exists()).toBe(true)
    expect(button.attributes('href')).toBe('/')
    expect(button.attributes('text')).toBe('Naar de startpagina')
    expect(button.attributes('variant')).toBe('primary')
    expect(button.attributes('size')).toBe('md')
  })
})

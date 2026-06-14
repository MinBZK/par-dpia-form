/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import NotFound from '../../src/views/NotFound.vue'

const routerLinkStub = {
  props: ['to'],
  template: '<a class="router-link-stub" :href="to"><slot /></a>',
}

function mountNotFound() {
  return mount(NotFound, {
    global: { stubs: { 'router-link': routerLinkStub } },
  })
}

describe('NotFound.vue', () => {
  it('renders the 404 heading and explanation', () => {
    const wrapper = mountNotFound()
    expect(wrapper.find('h1').text()).toBe('Pagina niet gevonden')
    expect(wrapper.text()).toContain('bestaat niet')
  })

  it('links back to the start page', () => {
    const wrapper = mountNotFound()
    const link = wrapper.find('.router-link-stub')
    expect(link.attributes('href')).toBe('/')
    expect(link.text()).toBe('Naar de startpagina')
  })
})

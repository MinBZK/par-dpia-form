import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
  positionDefinitionPanel,
  useDefinitionTooltips,
} from '../../src/composables/useDefinitionTooltips'

// jsdom gives every element a zero rect, so the panel's position is stubbed per
// case: the composable only reads getBoundingClientRect and window.innerWidth.
function makeTerm(panelRect: { left: number; right: number } | null): HTMLElement {
  const term = document.createElement('span')
  term.className = 'aiv-definition'
  term.textContent = 'DPIA'
  if (panelRect) {
    const panel = document.createElement('span')
    panel.className = 'aiv-definition-text'
    panel.getBoundingClientRect = () =>
      ({ left: panelRect.left, right: panelRect.right }) as DOMRect
    term.appendChild(panel)
  }
  document.body.appendChild(term)
  return term
}

function panelOf(term: HTMLElement): HTMLElement {
  return term.querySelector('.aiv-definition-text') as HTMLElement
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('positionDefinitionPanel', () => {
  it('shifts a panel that runs off the left edge back into view', () => {
    const term = makeTerm({ left: -120, right: 400 })

    positionDefinitionPanel(term, 1000)

    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).toBe('128px')
  })

  it('shifts a panel that runs off the right edge back into view', () => {
    const term = makeTerm({ left: 600, right: 1040 })

    positionDefinitionPanel(term, 1000)

    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).toBe('-48px')
  })

  it('leaves a panel that already fits alone, and leaves it hidden', () => {
    const term = makeTerm({ left: 100, right: 500 })

    positionDefinitionPanel(term, 1000)

    const panel = panelOf(term)
    expect(panel.style.getPropertyValue('--aiv-definition-shift')).toBe('')
    // Measuring must not leave the panel showing: :hover decides that.
    expect(panel.style.display).toBe('')
    expect(panel.style.visibility).toBe('')
  })

  it('clears a shift from a previous hover before measuring', () => {
    const term = makeTerm({ left: 100, right: 500 })
    panelOf(term).style.setProperty('--aiv-definition-shift', '128px')

    positionDefinitionPanel(term, 1000)

    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).toBe('')
  })

  it('does nothing for a term without a panel', () => {
    const term = makeTerm(null)

    expect(() => positionDefinitionPanel(term, 1000)).not.toThrow()
  })
})

describe('useDefinitionTooltips', () => {
  const Host = defineComponent({
    setup() {
      useDefinitionTooltips()
      return () => null
    },
  })

  it('places the panel of the term under the pointer, and ignores the rest', () => {
    const wrapper = mount(Host)
    const term = makeTerm({ left: -120, right: 400 })
    const elsewhere = document.createElement('p')
    document.body.appendChild(elsewhere)

    elsewhere.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).toBe('')

    term.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).not.toBe('')

    wrapper.unmount()
  })

  it('places the panel on keyboard focus too', () => {
    const wrapper = mount(Host)
    const term = makeTerm({ left: -120, right: 400 })

    term.dispatchEvent(new Event('focusin', { bubbles: true }))

    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).not.toBe('')
    wrapper.unmount()
  })

  it('stops listening once the component is gone', () => {
    const wrapper = mount(Host)
    wrapper.unmount()
    const term = makeTerm({ left: -120, right: 400 })

    term.dispatchEvent(new Event('pointerover', { bubbles: true }))

    expect(panelOf(term).style.getPropertyValue('--aiv-definition-shift')).toBe('')
  })

  it('survives an event whose target cannot be asked for a term', () => {
    const wrapper = mount(Host)

    expect(() => document.dispatchEvent(new Event('pointerover'))).not.toThrow()

    wrapper.unmount()
  })
})

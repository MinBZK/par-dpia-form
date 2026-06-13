import { describe, it, expect } from 'vitest'
import { autoGrowTextarea } from '../../src/utils/autoGrowTextarea'

describe('autoGrowTextarea', () => {
  it('adds the autogrow class and sizes the height custom property to scrollHeight', () => {
    const el = document.createElement('textarea')
    // jsdom has no layout engine, so scrollHeight must be stubbed.
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 137,
    })

    autoGrowTextarea(el)

    expect(el.classList.contains('autogrow-textarea')).toBe(true)
    expect(el.style.getPropertyValue('--autogrow-height')).toBe('137px')
  })

  it('reflects a different scrollHeight on a subsequent call', () => {
    const el = document.createElement('textarea')
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 42,
    })

    autoGrowTextarea(el)

    expect(el.classList.contains('autogrow-textarea')).toBe(true)
    expect(el.style.getPropertyValue('--autogrow-height')).toBe('42px')
  })
})

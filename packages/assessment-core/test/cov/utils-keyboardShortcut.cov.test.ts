import { describe, it, expect } from 'vitest'
import { formatShortcut } from '../../src/utils/keyboardShortcut'

describe('formatShortcut', () => {
  it('uses ⌘/⇧ symbols on macOS', () => {
    expect(formatShortcut('B', false, true)).toBe('⌘B')
    expect(formatShortcut('S', true, true)).toBe('⌘⇧S')
  })

  it('uses Ctrl+/Shift+ text on Windows/Linux', () => {
    expect(formatShortcut('B', false, false)).toBe('Ctrl+B')
    expect(formatShortcut('S', true, false)).toBe('Ctrl+Shift+S')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTheme, resetThemeForTesting } from '../../src/composables/useTheme'

function rootColorScheme(): string {
  return document.documentElement.style.getPropertyValue('color-scheme')
}

describe('useTheme', () => {
  beforeEach(() => {
    resetThemeForTesting()
    localStorage.clear()
    document.documentElement.style.removeProperty('color-scheme')
  })

  it('defaults to auto and clears the root color-scheme', () => {
    document.documentElement.style.setProperty('color-scheme', 'dark')
    const { theme } = useTheme()

    expect(theme.value).toBe('auto')
    expect(rootColorScheme()).toBe('')
  })

  it('restores a stored preference and applies it on first use', () => {
    localStorage.setItem('invulhulpen-theme', 'dark')
    const { theme } = useTheme()

    expect(theme.value).toBe('dark')
    expect(rootColorScheme()).toBe('dark')
  })

  it('ignores an invalid stored value and stays on auto', () => {
    localStorage.setItem('invulhulpen-theme', 'paars')
    const { theme } = useTheme()

    expect(theme.value).toBe('auto')
    expect(rootColorScheme()).toBe('')
  })

  it('setTheme applies, persists and shares state across instances', () => {
    const first = useTheme()
    first.setTheme('light')

    expect(rootColorScheme()).toBe('light')
    expect(localStorage.getItem('invulhulpen-theme')).toBe('light')

    // A second consumer (e.g. the account-menu toggle) sees the same state.
    const second = useTheme()
    expect(second.theme.value).toBe('light')

    second.setTheme('auto')
    expect(first.theme.value).toBe('auto')
    expect(rootColorScheme()).toBe('')
  })

  it('does not re-read storage after initialization', () => {
    useTheme()
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    useTheme()
    expect(getItem).not.toHaveBeenCalled()
    getItem.mockRestore()
  })
})

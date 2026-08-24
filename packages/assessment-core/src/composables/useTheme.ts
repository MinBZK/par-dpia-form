import { ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'invulhulpen-theme'

// Module-level singleton so every toggle instance (footer, account menu)
// shares one state.
const theme = ref<ThemePreference>('auto')
let initialized = false

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto'
}

// The NLDD palette is built on light-dark(), so the theme follows the CSS
// color-scheme on the root element; 'auto' clears it back to the OS choice.
function apply(preference: ThemePreference) {
  document.documentElement.style.setProperty(
    'color-scheme',
    preference === 'auto' ? '' : preference,
  )
}

export function useTheme() {
  if (!initialized) {
    initialized = true
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemePreference(stored)) theme.value = stored
    apply(theme.value)
  }

  const setTheme = (preference: ThemePreference) => {
    theme.value = preference
    localStorage.setItem(STORAGE_KEY, preference)
    apply(preference)
  }

  return { theme, setTheme }
}

// Test hook: reset the singleton between test cases.
export function resetThemeForTesting() {
  initialized = false
  theme.value = 'auto'
}

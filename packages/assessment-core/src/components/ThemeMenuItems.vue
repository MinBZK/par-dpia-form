<script setup lang="ts">
import { useTheme, type ThemePreference } from '../composables/useTheme'
import '@nldd/design-system/menu'

const { theme, setTheme } = useTheme()

const options: { value: ThemePreference; text: string; icon: string }[] = [
  { value: 'auto', text: 'Systeem', icon: 'display' },
  { value: 'light', text: 'Licht', icon: 'light-mode' },
  { value: 'dark', text: 'Donker', icon: 'dark-mode' },
]
</script>

<!-- Radio menu items for embedding in a host nldd-menu (the account menu):
     the theme choice stays tucked away instead of claiming its own chrome. -->
<template>
  <nldd-menu-item
    v-for="option in options"
    :key="option.value"
    type="radio"
    :text="option.text"
    :icon="option.icon"
    :selected="theme === option.value || undefined"
    @select="setTheme(option.value)"
  ></nldd-menu-item>
</template>

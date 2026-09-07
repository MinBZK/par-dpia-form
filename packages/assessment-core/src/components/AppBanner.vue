<script setup lang="ts">
import '@nldd/design-system/status-bar'
import '@nldd/design-system/top-navigation-bar'

withDefaults(defineProps<{
  message?: string
  linkLabel?: string
  title?: string
  subtitle?: string
  homeUrl?: string
  // Back button in the navigation bar. Without back-href the bar fires
  // back-click so the SPA can navigate itself.
  backText?: string
}>(), {
  message: 'Invulhulpen is in ontwikkeling en kan fouten bevatten',
  linkLabel: 'Bètaversie',
  title: 'Invulhulpen',
  subtitle: 'Pre-scan, DPIA en IAMA',
  homeUrl: '#',
  backText: undefined,
})

const emit = defineEmits<{ (e: 'back'): void }>()
</script>

<template>
  <nldd-status-bar
    class="app-banner__alert"
    variant="warning"
    :text="`${linkLabel} - ${message}`"
  ></nldd-status-bar>
  <nldd-top-navigation-bar
    class="app-banner__bar"
    :logo-title="title"
    :logo-subtitle="subtitle"
    :logo-href="homeUrl"
    :back-text="backText"
    @back-click="emit('back')"
  >
    <slot name="global"></slot>
    <slot name="utility"></slot>
  </nldd-top-navigation-bar>
</template>

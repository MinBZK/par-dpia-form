<script setup lang="ts">
import '@nldd/design-system/icon'

defineProps<{
  open?: boolean
}>()
</script>

<template>
  <details class="ui-accordion" :open="open">
    <summary class="ui-accordion__summary">
      <span class="ui-accordion__icon" aria-hidden="true">
        <nldd-icon name="chevron-down" size="20" color="accent" class="ui-accordion__icon--closed"></nldd-icon>
        <nldd-icon name="chevron-up" size="20" color="accent" class="ui-accordion__icon--open"></nldd-icon>
      </span>
      <span class="ui-accordion__title">
        <slot name="title" />
      </span>
    </summary>
    <div class="ui-accordion__content">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary'
  size?: 'xs' | 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  icon?: string
  fullWidth?: boolean
  label?: string
  ariaLabel?: string
}>()

const variantClass = computed(() => {
  switch (props.variant) {
    case 'tertiary':
    case 'quaternary':
      return `utrecht-button--rvo-${props.variant}-action`
    default:
      return `utrecht-button--${props.variant || 'primary'}-action`
  }
})

defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <button
    :class="[
      'utrecht-button',
      variantClass,
      `utrecht-button--rvo-${size || 'md'}`,
      fullWidth ? 'utrecht-button--rvo-full-width' : '',
    ]"
    :type="type || 'button'"
    :disabled="disabled"
    :aria-label="ariaLabel || label"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="$emit('click', $event)"
  >
    <span
      v-if="icon"
      :class="[
        'utrecht-icon',
        'rvo-icon',
        `rvo-icon-${icon}`,
        'rvo-icon--md',
        'rvo-icon--hemelblauw',
        'rvo-icon--with-spacing',
      ]"
      role="img"
      aria-label="icon"
    ></span>
    <span v-html="`${label ? label : ''}`"> </span>
    <!--{ label ? label : '' }} -->
  </button>
</template>

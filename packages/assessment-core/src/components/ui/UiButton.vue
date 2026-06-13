<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'warning'
  size?: 'xs' | 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  icon?: string
  showIconAfter?: boolean
  fullWidth?: boolean
  label?: string
  ariaLabel?: string
}>()

const variantClass = computed(() => {
  switch (props.variant) {
    case 'tertiary':
    case 'quaternary':
      return `rvo-button--${props.variant}`
    case 'warning':
      return 'rvo-button--primary rvo-button--warning'
    default:
      return `rvo-button--${props.variant || 'primary'}`
  }
})

defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <button
    :class="[
      'rvo-button',
      variantClass,
      `rvo-button--size-${size || 'md'}`,
      fullWidth ? 'rvo-button--full-width' : '',
    ]"
    :type="type || 'button'"
    :disabled="disabled"
    :aria-label="ariaLabel || label"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="$emit('click', $event)"
  >
  <template v-if="showIconAfter">
    <span v-html="`${label ? label : ''}`"> </span>
    <span
      v-if="icon"
      :class="[
        'utrecht-icon',
        'rvo-icon',
        `rvo-icon-${icon}`,
        'rvo-icon--md',
        'rvo-icon--hemelblauw',
        'rvo-icon--with-spacing-left',
      ]"
      role="img"
      aria-label="icon"
    ></span>
  </template>
  <template v-else>
    <span
      v-if="icon"
      :class="[
        'utrecht-icon',
        'rvo-icon',
        `rvo-icon-${icon}`,
        'rvo-icon--md',
        'rvo-icon--hemelblauw',
        'rvo-icon--with-spacing-right',
      ]"
      role="img"
      aria-label="icon"
    ></span>
    {{ label ? label : '' }}
  </template>


  </button>
</template>

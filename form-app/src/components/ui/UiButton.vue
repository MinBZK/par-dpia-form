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
      return `utrecht-button--rvo-${props.variant}-action`
    case 'warning':
      return 'utrecht-button--primary-action utrecht-button--warning rvo-margin-block-end--md'
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
  <template v-if="showIconAfter">
    {{ label ? label : '' }}
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
<<<<<<< HEAD
    <span v-html="`${label ? label : ''}`"> </span>
    <!--{ label ? label : '' }} -->
=======
    {{ label ? label : '' }}
  </template>


>>>>>>> main
  </button>
</template>

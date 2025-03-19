<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
  size?: 'xs' | 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  icon?: string;
  fullWidth?: boolean;
  label?: string;
  ariaLabel?: string;
}>()

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>()
</script>

<template>
  <button :class="['utrecht-button',
    `utrecht-button--${variant || 'primary'}-action`,
    `utrecht-button--rvo-${size || 'md'}`,
    fullWidth ? 'utrecht-button--rvo-full-width' : '',
  ]" :type="type || 'button'" :disabled="disabled" :aria-label="ariaLabel || label"
    :aria-disabled="disabled ? 'true' : undefined" @click="$emit('click', $event)">
    <span v-if="icon" :class="['utrecht-icon',
      'rvo-icon',
      `rvo-icon-${icon}`,
      'rvo-icon--md',
      'rvo-icon--hemelblauw']" role="img" aria-label="icon"></span>
    {{ label ? label : '' }}
  </button>
</template>

<script setup lang="ts">
import '@nldd/design-system/icon'
import '@nldd/design-system/icon-button'
import '@nldd/design-system/menu'

defineProps<{
  label: string
}>()
</script>

<template>
  <!-- NLDD only ships a horizontal ellipsis, so the icon goes in through the
       icon slot and is turned upright there; rotating the button itself would
       take its focus ring and tooltip along. -->
  <nldd-icon-button :text="label" variant="neutral-transparent" size="sm" popup-type="menu">
    <nldd-icon slot="icon" name="ellipsis" class="kebab-menu__icon"></nldd-icon>
    <nldd-menu slot="popup">
      <slot />
    </nldd-menu>
  </nldd-icon-button>
</template>

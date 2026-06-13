<script setup lang="ts">
import { type NavigationFunctions } from '../models/navigation'

defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <div class="rvo-menubar__background rvo-menubar__background--horizontal-rule">
    <!-- Same --lg width + inline padding as the sidebar-layout below (and as the
         boekhouding header), so the back button aligns with the table of contents
         (left) and the action slot aligns with the right edge of the question list. -->
    <div class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--md nav-header__bar">
      <button
        type="button"
        class="rvo-button rvo-button--tertiary rvo-button--size-xs rvo-button--icon-before"
        @click="navigation.goToLanding"
      >
        <span
          class="utrecht-icon rvo-icon rvo-icon-terug rvo-icon--sm"
          role="img"
          aria-label="Terug"
        ></span>
        Terug naar overzicht
      </button>
      <div class="nav-header__actions">
        <slot />
      </div>
    </div>
  </div>
</template>

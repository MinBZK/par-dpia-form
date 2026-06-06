<script setup lang="ts">
import { type NavigationFunctions } from '../models/navigation'

defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <div class="rvo-menubar__background rvo-menubar__background--horizontal-rule">
    <!-- Constrain to the same --lg width as the sidebar-layout below, so the back
         link aligns with the table of contents (left) and the action slot aligns
         with the right edge of the question list. -->
    <div class="rvo-max-width-layout rvo-max-width-layout--lg"
      style="display: flex; align-items: center; justify-content: space-between; gap: var(--rvo-space-md, 1rem);">
      <nav class="rvo-menubar rvo-menubar--md">
        <ul class="rvo-menubar__ul">
          <li class="rvo-menubar__list">
            <ul class="rvo-menubar__group--flex">
              <li class="rvo-menubar__item">
                <a
                  class="rvo-link rvo-menubar__link rvo-link--logoblauw"
                  @click.prevent="navigation.goToLanding"
                >
                  <span
                    class="utrecht-icon rvo-icon rvo-icon-terug rvo-icon--md"
                    role="img"
                    aria-label="Terug"
                  ></span>
                  Terug naar overzicht
                </a>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
      <div style="display: flex; align-items: center; gap: var(--rvo-space-sm, 0.5rem);">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type NavigationFunctions } from '@/models/navigation'

defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <div class="rvo-menubar__background rvo-menubar__background--horizontal-rule">
    <nav class="rvo-menubar rvo-menubar--md">
      <ul class="rvo-menubar__ul">
        <li class="rvo-menubar__list">
          <ul class="rvo-menubar__group--flex">
            <li class="rvo-menubar__item">
              <a class="rvo-link rvo-menubar__link rvo-link--logoblauw" @click="navigation.goToLanding">
                <span class="utrecht-icon rvo-icon rvo-icon-terug rvo-icon--md" role="img" aria-label="Terug"></span>
                Terug naar overzicht
              </a>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  </div>
</template>

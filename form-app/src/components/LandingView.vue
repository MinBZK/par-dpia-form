<script setup lang="ts">
import AppBanner from '@/components/AppBanner.vue'
import { type NavigationFunctions } from '@/models/navigation'

const props = defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <AppBanner />
  <div class="rvo-layout-column rvo-layout-gap--3xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md
        rvo-max-width-layout-inline-padding--md">
      <h1 class="utrecht-heading-1">DPIA Tools</h1>
      <p class="rvo-text--lg">
        Deze tool kan worden gebruikt om een Pre Scan DPIA of een DPIA volgens het Rapportagemodel in
        te vullen.
      </p>

      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content">
              <h2 class="utrecht-heading-2">Pre Scan DPIA</h2>
              <button class="utrecht-button utrecht-button--primary-action" @click="navigation.goToPreScanDPIA">
                Start Pre Scan DPIA
              </button>
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content">
              <h2 class="utrecht-heading-2">DPIA Rapportagemodel</h2>
              <button class="utrecht-button utrecht-button--primary-action" @click="navigation.goToDPIA">
                Start DPIA Rapportagemodel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

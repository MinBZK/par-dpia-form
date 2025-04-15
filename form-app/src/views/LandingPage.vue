<!-- form-app/src/views/LandingPage.vue -->
<script setup lang="ts">
import AppBanner from '@/components/AppBanner.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateToDPIA = () => {
  router.push('/dpia')
}

const navigateToPreScanDPIA = () => {
  router.push('/prescan-dpia')
}
</script>

<template>
  <AppBanner />
  <div class="rvo-max-width-layout rvo-layout-center rvo-layout-margin-vertical--3xl">
    <h1 class="utrecht-heading-1">Data Protection Impact Assessment Tools</h1>

    <div class="rvo-layout-column rvo-layout-gap--md rvo-layout-margin-vertical--2xl">
      <div class="rvo-alert rvo-alert--warning rvo-alert--padding-md">
        <span
          class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing"
          role="img"
          aria-label="Waarschuwing"
        ></span>
        <div class="rvo-alert-text">
          <div>Deze pagina is in bètaversie. Deze beslishulp is in ontwikkeling.</div>
        </div>
      </div>
    </div>

    <div class="rvo-layout-row rvo-layout-gap--xl rvo-layout-wrap">
      <!-- DPIA Card -->
      <div class="rvo-card rvo-card--bordered">
        <div class="rvo-card__header">
          <h2 class="utrecht-heading-2">DPIA Rapportagemodel</h2>
        </div>
        <div class="rvo-card__content">
          <p class="utrecht-paragraph">
            Het DPIA Rapportagemodel helpt u bij het uitvoeren van een volledige Data Protection Impact Assessment
            volgens het Rijksmodel DPIA versie 3.0.
          </p>
        </div>
        <div class="rvo-card__footer">
          <button
            class="utrecht-button utrecht-button--primary-action"
            @click="navigateToDPIA"
          >
            Start DPIA Rapportagemodel
          </button>
        </div>
      </div>

      <!-- Pre Scan DPIA Card -->
      <div class="rvo-card rvo-card--bordered">
        <div class="rvo-card__header">
          <h2 class="utrecht-heading-2">Pre Scan DPIA</h2>
        </div>
        <div class="rvo-card__content">
          <p class="utrecht-paragraph">
            De Pre Scan DPIA helpt u te bepalen of het uitvoeren van een DPIA noodzakelijk is.
            Gebruik deze tool voor een snelle beoordeling van de noodzaak van een DPIA.
          </p>
        </div>
        <div class="rvo-card__footer">
          <button
            class="utrecht-button utrecht-button--primary-action"
            @click="navigateToPreScanDPIA"
          >
            Start Pre Scan DPIA
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rvo-card {
  flex-basis: 100%;
  max-width: 450px;
}

@media (min-width: 840px) {
  .rvo-card {
    flex-basis: calc(50% - 1rem);
  }
}
</style>

<script setup lang="ts">
import AppBanner from '@/components/AppBanner.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type NavigationFunctions } from '@/models/navigation'

defineProps<{
  navigation: NavigationFunctions
}>()
</script>

<template>
  <AppBanner />
  <div class="rvo-layout-column rvo-layout-gap--3xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
      <h1 class="utrecht-heading-1">Ondersteuning bij DPIA’s</h1>
      <p class="rvo-text--lg">
        Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke
        privacyrisico’s. Deze tools helpen je daarbij. Ze zijn gebaseerd op het <a
          href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA">Rijksmodel DPIA Rijksdienst</a> en sluiten aan
        op rijksbrede kaders, inclusief AI en kinderrechten.
        Gebruik de pre-scan om te bepalen of een DPIA, IAMA, KIA en/of DTIA moet worden uitgevoerd. Is een DPIA nodig?
        Dan kun je direct verder met het rapportagemodel.
      </p>

      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2">Pre-scan DPIA</h2>
              <p>Met de pre-scan DPIA toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst
                die helpt bij het inschatten van risico’s en geeft op basis daarvan advies over het uitvoeren van een
                DPIA. Daarnaast geeft de tool ook advies over de noodzaak van een IAMA, KIA of DTIA.</p>
              <UiButton variant="primary" label="Start Pre-scan DPIA" class="card-button"
                @click="navigation.goToPreScanDPIA" />
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content card-content-flex">
              <h2 class="utrecht-heading-2">DPIA Rapportagemodel</h2>
              <p>Deze tool begeleidt je stap voor stap bij het uitvoeren van een DPIA. De rapportage voldoet aan de
                eisen uit de AVG en het model DPIA Rijksdienst, en is geschikt voor verwerking in het
                verwerkingsregister.</p>
              <UiButton variant="primary" label="Start DPIA Rapportagemodel" class="card-button"
                @click="navigation.goToDPIA" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

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
      <p class="rvo-padding-block-end--lg">
        Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke
        privacyrisico’s. Deze tools helpen je daarbij. Ze zijn gebaseerd op het <a
          href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA">Rijksmodel DPIA Rijksdienst</a> en sluiten aan
        op rijksbrede kaders, inclusief AI en kinderrechten.
      </p>

      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3">Pre-scan DPIA</h3>
              <p class="rvo-padding-block-end--sm">Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst
                die helpt bij het inschatten van risico’s en geeft op basis daarvan advies over het uitvoeren van een
                assessment.</p>
              <UiButton variant="primary" label="Start pre-scan DPIA" class="card-button"
                @click="navigation.goToPreScanDPIA" />
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3">DPIA Rapportagemodel</h3>
              <p class="rvo-padding-block-end--sm">Deze tool begeleidt je stap voor stap bij het uitvoeren van een DPIA. De rapportage voldoet aan de
                eisen uit de AVG en het model DPIA Rijksdienst, en is geschikt voor verwerking in het
                verwerkingsregister.</p>
              <UiButton variant="primary" label="Start DPIA Rapportagemodel" class="card-button"
                @click="navigation.goToDPIA" />
            </div>
          </div>
        </div>
      </div>

      <div class="rvo-layout-margin-vertical--3xl">
        <div class="rvo-alert rvo-alert--info rvo-alert--padding-md">
          <span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img"
            aria-label="Info"></span>
          <div class="rvo-alert-text">
            <strong>Opslaan en delen van je DPIA</strong>
            <p>
              Tijdens het invullen kun je je voortgang opslaan als een bestand op je eigen computer.
            </p>

            <p>
              Wat kun je <strong> wel </strong> met het opgeslagen bestand? <br />
              ✅ Je kunt dit bestand later opnieuw openen om verder te werken. <br />
              ✅ Je kunt het ook delen met een collega zodat die verder kan gaan. <br />
            </p>

            <p>
            Wat kun je <strong> niet </strong> met het opgeslagen bestand? <br />
              ❌ Je kunt het bestand niet openen in Word. <br />
              ❌ Je kunt het bestand niet direct bewerken buiten deze tool. <br />
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

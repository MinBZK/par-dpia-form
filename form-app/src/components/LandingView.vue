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
  <div class="rvo-layout-column rvo-layout-gap--3xl rvo-margin-block-start--xl">
    <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
      <h1 class="utrecht-heading-1">Ondersteuning bij gegevensbescherming</h1>
      <p class="rvo-padding-block-end--lg">
        Bij verwerkingen van persoonsgegevens is het belangrijk om vroegtijdig inzicht te krijgen in mogelijke
        privacyrisico's. Deze tools helpen je daarbij. Ze zijn gebaseerd op het <a
          href="https://modellen.jenvgegevens.nl/dpia/#IntroPre-scanDPIA">Informatiemodellen voor de DPIA en pre-scan DPIA</a> en <a href="https://www.kcbr.nl/sites/default/files/2023-08/Rapportagemodel%20DPIA%20Rijksdienst%20v3.0.docx">Rapportagemodel DPIA Rijksdienst</a> en sluiten aan
        op rijksbrede kaders, inclusief AI en kinderrechten.
      </p>

      <div class="rvo-layout-grid-container">
        <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3 ">Pre-scan</h3>
              <p class="rvo-padding-block-end--sm">Toets snel of een DPIA, DTIA, IAMA of KIA nodig is op basis van risico’s.</p>
              <UiButton variant="primary" label="Start pre-scan" class="card-button"
                @click="navigation.goToPreScanDPIA" />
            </div>
          </div>
          <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour--grijs-100">
            <div class="rvo-card__content card-content-flex">
              <h3 class="utrecht-heading-3">DPIA</h3>
              <p class="rvo-padding-block-end--sm">Voer een DPIA uit volgens het model van de Rijksoverheid, stap voor stap.</p>
              <UiButton variant="primary" label="Start DPIA" class="card-button"
                @click="navigation.goToDPIA" />
            </div>
          </div>
        </div>
      </div>

      <div class="rvo-layout-margin-vertical--xl">
        <div class="rvo-card rvo-card--outline rvo-card--padding-md rvo-card__full-card-link rvo-card--full-colour-wit">
          <div class="rvo-layout-row rvo-layout-gap--xs" style="align-items: center;">
            <span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img" aria-label="Info"></span>
            <strong>Opslaan en delen van je DPIA</strong>
          </div>
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
</template>

<script setup lang="ts">
import AppBanner from '@/components/AppBanner.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const navigateToHome = () => {
  router.push('/')
}

const navigateToDPIA = () => {
  router.push('/dpia')
}
</script>

<template>
  <AppBanner />

  <div class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg">
    <div class="rvo-sidebar-layout__content">
      <div class="rvo-layout-margin-vertical--s">
        <!-- Back to home button -->
        <UiButton
          variant="tertiary"
          icon="terug"
          label="Terug naar overzicht"
          @click="navigateToHome"
        />

        <h1 class="utrecht-heading-1">Pre Scan DPIA</h1>

        <div class="rvo-layout-column rvo-layout-gap--md rvo-layout-margin-vertical--2xl">
          <div class="rvo-alert rvo-alert--warning rvo-alert--padding-md">
            <span
              class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing"
              role="img"
              aria-label="Waarschuwing"
            ></span>
            <div class="rvo-alert-text">
              <div><strong>In ontwikkeling</strong> - De Pre Scan DPIA tool is nog in ontwikkeling.</div>
            </div>
          </div>
        </div>

        <div class="rvo-layout-column rvo-layout-gap--2xl">
          <div class="utrecht-form-fieldset rvo-form-fieldset">
            <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
              <p class="utrecht-paragraph preserve-whitespace">
                De Pre Scan DPIA tool wordt momenteel ontwikkeld. Deze tool zal u helpen te bepalen
                of u verplicht bent een volledige DPIA uit te voeren.

                Verwachte functionaliteiten:
                - Eenvoudige vragenlijst om te bepalen of een DPIA nodig is
                - Gebaseerd op artikel 35 van de AVG en richtlijnen van AP
                - PDF-export van bevindingen
                - Naadloze overgang naar volledige DPIA indien nodig
              </p>
            </fieldset>
          </div>

          <div class="rvo-layout-margin-vertical--xl">
            <UiButton
              variant="primary"
              label="Ga naar DPIA Rapportagemodel"
              @click="navigateToDPIA"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

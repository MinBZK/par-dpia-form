<script setup lang="ts">
import { useCalculationStore } from '@/stores/calculations'
import { computed, onMounted } from 'vue'
import AssessmentCard from './AssessmentCard.vue'

const calculationStore = useCalculationStore()

onMounted(() => {
  calculationStore.init()
})

// Define assessment configurations centrally
const assessmentConfigs = [
  {
    id: 'DPIA',
    title: 'DPIA',
    definition: `Een DPIA is een instrument om van een [organisatorische activiteit],
      waarbij [persoonsgegevens] worden verwerkt, de risico's voor betrokkenen in kaart
      te brengen en te beoordelen in hoeverre de huidige [maatregelen] voldoen en welke
      aanvullende [maatregelen] genomen moeten worden om elk [risico voor betrokkenen]
      zoveel mogelijk te mitigeren.`
  },
  {
    id: 'IAMA',
    title: 'IAMA',
    definition: `De IAMA is een instrument voor discussie en besluitvorming voor overheidsorganen,
      dat een interdisciplinaire dialoog mogelijk maakt door degenen die verantwoordelijk
      zijn voor de ontwikkeling en/of inzet van een [algoritme].
      <h4>Toelichting:</h4>
      Het IAMA bevat een groot aantal vragen waarover discussie plaats
      moet vinden en waarop een antwoord moet worden geformuleerd in alle gevallen
      waarin een overheidsorgaan overweegt een algoritme te (laten) ontwikkelen, in
      te kopen, aan te passen en/of in te gaan zetten. Ook wanneer een algoritme al
      wordt ingezet kan het IAMA dienen als instrument voor reflectie.`
  },
  {
    id: 'DTIA',
    title: 'DTIA',
    definition: `Een DTIA is een onderzoek naar een specifieke [internationale doorgifte],
      de daaraan verbonden risico's en de mogelijkheden om de geïnventariseerde risico's
      te mitigeren.`
  },
  {
    id: 'KIA',
    title: 'KIA',
    definition: `Een Kinderrechten Impact Assessment (KIA) is een hulpmiddel om te komen
      tot de best mogelijke beoordeling van de [digitale dienst] in relatie tot de rechten
      en het welzijn van kinderen.`
  }
]

// Get assessment results from store
const getAssessmentResult = (id: string) => {
  return calculationStore.assessmentResults.find(assessment => assessment.id === id)
}
</script>

<template>
  <div class="rvo-layout-grid-container">
    <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
      <!-- Dynamically render all assessment cards -->
      <AssessmentCard
        v-for="config in assessmentConfigs"
        :key="config.id"
        :id="config.id"
        :title="config.title"
        :definition="config.definition"
        :result="getAssessmentResult(config.id)"
        :isCalculating="calculationStore.isCalculating"
      />
    </div>
  </div>
</template>

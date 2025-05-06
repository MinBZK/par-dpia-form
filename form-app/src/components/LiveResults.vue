<script setup lang="ts">
import { useCalculationStore } from '@/stores/calculations'
import { computed, onMounted } from 'vue'

const calculationStore = useCalculationStore()

onMounted(() => {
  calculationStore.init()
})

const hasRequiredOrRecommendedAssessments = computed(() => {
  return calculationStore.assessmentResults.some(assessment =>
    assessment.required || assessment.level === 'recommended'
  );
})
</script>

<template>
  <div class="assessment-results rvo-card">

    <div class="rvo-accordion">
      <details class="rvo-accordion__item" :open="hasRequiredOrRecommendedAssessments">
        <summary class="rvo-accordion__item-summary">
          <div class="rvo-accordion__item-icon">
            <span
              class="utrecht-icon rvo-icon rvo-icon-delta-omlaag rvo-icon--md rvo-icon--hemelblauw rvo-accordion__item-icon--closed"
              role="img" aria-label="Delta omlaag"></span>
            <span
              class="utrecht-icon rvo-icon rvo-icon-delta-omhoog rvo-icon--md rvo-icon--hemelblauw rvo-accordion__item-icon--open"
              role="img" aria-label="Delta omhoog"></span>
          </div>
          <div class="rvo-accordion__item-title-container">
            <h3 class="rvo-accordion__item-title utrecht-heading-3 rvo-heading--no-margins rvo-heading--mixed">
              Tussenresultaten pre-scan
            </h3>
            <div class="rvo-accordion-teaser">Op basis van de huidige antwoorden zijn dit
              verplichte/aangeraden assessments.</div>
          </div>
        </summary>
        <div class="rvo-accordion__content">
          <div v-if="calculationStore.isCalculating">
            Berekenen...
          </div>

          <div v-else>
            <div v-if="!calculationStore.assessmentResults.some(r => r.required)">
              <p>Op basis van de huidige antwoorden zijn er geen assessments vereist.</p>
            </div>

            <div v-else>
              <div v-for="assessment in calculationStore.assessmentResults.filter(r => r.required)"
                :key="assessment.id">
                <p>
                  <strong>{{ assessment.id }}</strong><br>
                </p>
                <p v-html="assessment.explanation.replace(/\n/g, '<br>')"></p>
              </div>
            </div>

            <div v-if="calculationStore.calculationErrors.length > 0">
              <p>Er zijn fouten opgetreden tijdens de berekening:</p>
              <ul>
                <li v-for="(error, index) in calculationStore.calculationErrors" :key="index">
                  {{ error }}
                </li>
              </ul>
            </div>
          </div>

        </div>
      </details>
    </div>
  </div>
</template>

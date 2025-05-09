<script setup lang="ts">
import { useCalculationStore } from '@/stores/calculations'
import type { AssessmentResult, CriterionResult } from '@/stores/calculations'
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

interface ExplanationResult {
  hasCriteria: boolean;
  intro?: string;
  points?: string[];
  text: string;
}

const renderAssessmentExplanation = (assessment: AssessmentResult): ExplanationResult => {
  // Get the correct intro text based on the level
  const introText = assessment.level === 'recommended'
    ? `Een ${assessment.id} wordt aanbevolen omdat:`
    : `Een ${assessment.id} is verplicht omdat:`;

  if (assessment.criteria && assessment.criteria.length > 0) {
    return {
      hasCriteria: true,
      intro: introText,
      points: assessment.criteria.map((c: CriterionResult) => c.explanation),
      text: assessment.explanation || '' // Provide fallback text
    }
  } else {
    // Fall back to general explanation
    return {
      hasCriteria: false,
      text: assessment.explanation || ''
    }
  }
}
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

                <!-- Using the extracted rendering logic -->
                <template v-if="renderAssessmentExplanation(assessment).hasCriteria">
                  <p>{{ renderAssessmentExplanation(assessment).intro }}</p>
                  <ul class="utrecht-unordered-list">
                    <li v-for="(point, index) in renderAssessmentExplanation(assessment).points" :key="index"
                      class="utrecht-unordered-list__item">
                      {{ point }}
                    </li>
                  </ul>
                </template>
                <p v-else v-html="renderAssessmentExplanation(assessment).text.replace(/\n/g, '<br>')"></p>
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

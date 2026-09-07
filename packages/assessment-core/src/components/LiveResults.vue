<script setup lang="ts">
import { useCalculationStore } from '../stores/calculations'
import type { AssessmentResult, CriterionResult } from '../stores/calculations'
import { computed, onMounted } from 'vue'
import UiAccordion from './ui/UiAccordion.vue'
import '@nldd/design-system/card'
import '@nldd/design-system/rich-text'
import '@nldd/design-system/container'
import '@nldd/design-system/title'

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
  // Get the correct intro text based on the level and assessment type
  let introText;
  if (assessment.level === 'recommended') {
    introText = `Een ${assessment.id} wordt aanbevolen omdat:`;
  } else {
    if (assessment.id === 'IAMA') {
      introText = `Een ${assessment.id} is sterk aanbevolen omdat:`;
    } else if (assessment.id === 'KIA') {
      introText = `Een ${assessment.id} is aanbevolen omdat:`;
    } else {
      introText = `Een ${assessment.id} is verplicht omdat:`;
    }
  }

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
  <!-- No assessments: static block with same styling but no expand/collapse -->
  <nldd-card v-if="!hasRequiredOrRecommendedAssessments" class="assessment-results">
    <nldd-container padding="16">
      <nldd-title size="3">
        <h3>Tussenresultaten pre-scan</h3>
        <p slot="subtitle">Op basis van de huidige antwoorden zijn er geen assessments vereist.</p>
      </nldd-title>
    </nldd-container>
  </nldd-card>

  <!-- Assessments found: expandable accordion -->
  <nldd-card v-else class="assessment-results">
    <nldd-container padding="16">
      <UiAccordion open>
        <template #title>
          <nldd-title size="3">
            <h3>Tussenresultaten pre-scan</h3>
            <p slot="subtitle">Op basis van de huidige antwoorden zijn er verplichte/aangeraden assessments.</p>
          </nldd-title>
        </template>
        <div v-if="calculationStore.isCalculating">
          Berekenen...
        </div>

        <!-- Real headings per assessment, in rich-text: it gives a heading more
             room above than below, so an explanation reads as part of the
             assessment it belongs to. -->
        <nldd-rich-text v-else>
          <template v-for="assessment in calculationStore.assessmentResults.filter(r => r.required)"
            :key="assessment.id">
            <h4>{{ assessment.id }}</h4>

            <template v-if="renderAssessmentExplanation(assessment).hasCriteria">
              <p>{{ renderAssessmentExplanation(assessment).intro }}</p>
              <ul>
                <li v-for="(point, index) in renderAssessmentExplanation(assessment).points" :key="index">
                  {{ point }}
                </li>
              </ul>
            </template>
            <p v-else v-html="renderAssessmentExplanation(assessment).text.replace(/\n/g, '<br>')"></p>
          </template>

          <template v-if="calculationStore.calculationErrors.length > 0">
            <h4>Fouten tijdens de berekening</h4>
            <ul>
              <li v-for="(error, index) in calculationStore.calculationErrors" :key="index">
                {{ error }}
              </li>
            </ul>
          </template>
        </nldd-rich-text>
      </UiAccordion>
    </nldd-container>
  </nldd-card>
</template>

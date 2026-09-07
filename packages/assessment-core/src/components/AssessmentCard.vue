<script setup lang="ts">
import { computed } from 'vue';
import '@nldd/design-system/card'
import '@nldd/design-system/container'
import '@nldd/design-system/tag'
import '@nldd/design-system/title'
import type { AssessmentResult } from '../stores/calculations';

const props = defineProps<{
  id: string
  title: string
  definition: string
  result?: AssessmentResult
  isCalculating: boolean
}>()

const isRequired = computed(() => props.result?.required === true)
const isRecommended = computed(() => props.result?.required === true && props.result?.level === 'recommended')
const hasCriteria = computed(() => props.result?.criteria && props.result.criteria.length > 0)

const introText = computed(() => {
  if (isRecommended.value) {
    return `Een ${props.id} wordt aanbevolen omdat:`;
  } else if (isRequired.value) {
    return `Een ${props.id} is verplicht omdat:`;
  }
  return '';
});

const statusTag = computed(() => {
  if (isRecommended.value) return { color: 'warning', text: 'Aanbevolen' }
  if (isRequired.value) return { color: 'accent', text: 'Verplicht' }
  return { color: 'neutral', text: 'Niet verplicht' }
})
</script>

<template>
  <nldd-card class="assessment-card">
    <nldd-container padding="16" gap="8">
      <!-- Card Title with Definition -->
      <nldd-title size="3">
        <h2>
          <span class="aiv-definition">{{ title }}
            <span class="aiv-definition-text">{{ definition }}</span>
          </span>
        </h2>
      </nldd-title>

      <div v-if="!isCalculating">
        <nldd-tag :color="statusTag.color" :text="statusTag.text"></nldd-tag>
      </div>

      <!-- Loading State -->
      <p v-if="isCalculating">Berekenen...</p>

      <!-- Results with Criteria -->
      <template v-else-if="result">
        <!-- For required assessments with criteria -->
        <div v-if="(isRequired || isRecommended) && hasCriteria">
          <p>{{ introText }}</p>
          <ul>
            <li v-for="criterion in result.criteria" :key="criterion.id">
              {{ criterion.explanation }}
            </li>
          </ul>
        </div>

        <!-- For required assessments without criteria (fallback) -->
        <p v-else-if="isRequired || isRecommended">
          {{ result.explanation }}
        </p>
      </template>
    </nldd-container>
  </nldd-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssessmentResult, CriterionResult } from '@/stores/calculations';

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
</script>

<template>
  <div :class="[
    'rvo-card',
    'rvo-card--outline',
    'rvo-card--padding-md',
    isRequired
      ? 'rvo-card--full-colour--hemelblauw'
      : 'rvo-card--full-colour--grijs-100'
  ]">
    <div class="rvo-card__content card-content-flex">
      <!-- Card Title with Definition -->
      <h2 class="utrecht-heading-2" :class="isRequired ? 'font-white' : 'font-hemelblauw'">
        <span class="aiv-definition">{{ title }}
          <span class="aiv-definition-text">{{ definition }}</span>
        </span>
      </h2>

      <!-- Loading State -->
      <p v-if="isCalculating">Berekenen...</p>

      <!-- Results with Criteria -->
      <template v-else-if="result">
        <!-- For required assessments with criteria -->
        <div v-if="(isRequired || isRecommended) && hasCriteria" :class="{ 'font-white': isRequired || isRecommended }">
          <p>{{ introText }}</p>
          <ul>
            <li v-for="criterion in result.criteria" :key="criterion.id">
              {{ criterion.explanation }}
            </li>
          </ul>
        </div>

        <!-- For required assessments without criteria (fallback) -->
        <p v-else-if="isRequired || isRecommended" :class="{ 'font-white': isRequired || isRecommended }">
          {{ result.explanation }}
        </p>

        <!-- For non-required assessments -->
        <p v-else>Niet verplicht</p>
      </template>

      <!-- No results state -->
      <p v-else>Niet verplicht</p>
    </div>
  </div>
</template>

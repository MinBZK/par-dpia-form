<script setup lang="ts">
import { useCalculationStore } from '@/stores/calculations'
import { onMounted } from 'vue'

const calculationStore = useCalculationStore()

onMounted(() => {
  calculationStore.init()
})
</script>

<template>
  <div class="assessment-results rvo-card">
    <h2 class="utrecht-heading-2">Benodigde assessments</h2>

    <div v-if="calculationStore.isCalculating" class="loading">
      <span class="utrecht-icon rvo-icon rvo-icon-refresh rvo-icon--md"></span>
      <span>Berekenen...</span>
    </div>

    <div v-else class="results-content">
      <div v-if="!calculationStore.assessmentResults.some(r => r.required)" class="no-results">
        <p>Op basis van de huidige antwoorden zijn er geen assessments vereist.</p>
        <p class="note">Deze resultaten kunnen veranderen naarmate u meer vragen beantwoordt.</p>
      </div>

      <div v-else>
        <p class="note">Op basis van uw huidige antwoorden:</p>

        <div
          v-for="assessment in calculationStore.assessmentResults.filter(r => r.required)"
          :key="assessment.id"
          class="result-item"
        >
          <div class="result-header">
            <span class="result-badge">{{ assessment.id }}</span>
            <strong>{{ assessment.result }}</strong>
          </div>
          <div class="result-explanation">
            <!-- Use v-html with whitespace preserved -->
            <p v-html="assessment.explanation.replace(/\n/g, '<br>')"></p>
          </div>
        </div>

        <p class="note">Deze resultaten kunnen veranderen naarmate u meer vragen beantwoordt.</p>
      </div>

      <div v-if="calculationStore.calculationErrors.length > 0" class="calculation-errors">
        <p>Er zijn fouten opgetreden tijdens de berekening:</p>
        <ul>
          <li v-for="(error, index) in calculationStore.calculationErrors" :key="index">
            {{ error }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assessment-results {
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 0.25rem;
}

.loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--rvo-color-grijs-700);
}

.note {
  font-style: italic;
  font-size: 0.9rem;
  color: var(--rvo-color-grijs-700);
  margin: 0.75rem 0;
}

.result-item {
  margin: 1rem 0;
  padding: 0.75rem;
  background-color: var(--rvo-color-grijs-100);
  border-left: 3px solid var(--rvo-color-hemelblauw);
}

.result-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}

.result-badge {
  background-color: var(--rvo-color-hemelblauw);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  margin-right: 0.75rem;
  font-size: 0.85rem;
  font-weight: bold;
}

.result-explanation p {
  margin: 0;
  font-size: 0.95rem;
}

.calculation-errors {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: var(--rvo-color-zalm-tint-1);
  border-left: 3px solid var(--rvo-color-rood);
}
</style>

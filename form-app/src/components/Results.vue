<script setup lang="ts">
import { useCalculationStore } from '@/stores/calculations'
import { computed, onMounted } from 'vue'

const calculationStore = useCalculationStore()

onMounted(() => {
  calculationStore.init()
})

const getAssessmentResult = (id: string) => {
  return calculationStore.assessmentResults.find(assessment => assessment.id === id)
}

const dpiaResult = computed(() => getAssessmentResult('DPIA'))
const iamaResult = computed(() => getAssessmentResult('IAMA'))
const dtiaResult = computed(() => getAssessmentResult('DTIA'))
const kiaResult = computed(() => getAssessmentResult('KIA'))
</script>

<template>
  <div class="rvo-layout-grid-container">
    <div class="rvo-layout-grid rvo-layout-gap--md rvo-layout-grid-columns--two">
      <!-- DPIA Card -->
      <div :class="[
        'rvo-card',
        'rvo-card--outline',
        'rvo-card--padding-md',
        dpiaResult && dpiaResult.required
          ? 'rvo-card--full-colour--hemelblauw'
          : 'rvo-card--full-colour--grijs-100'
      ]">
        <div class="rvo-card__content card-content-flex">
          <h2 class="utrecht-heading-2" :class="dpiaResult && dpiaResult.required ? 'font-white' : 'font-hemelblauw'">
            DPIA</h2>
          <p v-if="calculationStore.isCalculating">Berekenen...</p>
          <p v-else-if="dpiaResult" :class="{ 'font-white': dpiaResult.required }">
            {{ dpiaResult.required ? dpiaResult.explanation : 'Niet verplicht' }}
          </p>
          <p v-else>Niet verplicht</p>
        </div>
      </div>

      <!-- IAMA Card -->
      <div :class="[
        'rvo-card',
        'rvo-card--outline',
        'rvo-card--padding-md',
        iamaResult && iamaResult.required
          ? 'rvo-card--full-colour--hemelblauw'
          : 'rvo-card--full-colour--grijs-100'
      ]">
        <div class="rvo-card__content card-content-flex">
          <h2 class="utrecht-heading-2" :class="iamaResult && iamaResult.required ? 'font-white' : 'font-hemelblauw'">
            IAMA</h2>
          <p v-if="calculationStore.isCalculating">Berekenen...</p>
          <p v-else-if="iamaResult" :class="{ 'font-white': iamaResult.required }">
            {{ iamaResult.required ? iamaResult.explanation : 'Niet verplicht' }}
          </p>
          <p v-else>Niet verplicht</p>
        </div>
      </div>

      <!-- DTIA Card -->
      <div :class="[
        'rvo-card',
        'rvo-card--outline',
        'rvo-card--padding-md',
        dtiaResult && dtiaResult.required
          ? 'rvo-card--full-colour--hemelblauw'
          : 'rvo-card--full-colour--grijs-100'
      ]">
        <div class="rvo-card__content card-content-flex">
          <h2 class="utrecht-heading-2" :class="dtiaResult && dtiaResult.required ? 'font-white' : 'font-hemelblauw'">
            DTIA</h2>
          <p v-if="calculationStore.isCalculating">Berekenen...</p>
          <p v-else-if="dtiaResult" :class="{ 'font-white': dtiaResult.required }">
            {{ dtiaResult.required ? dtiaResult.explanation : 'Niet verplicht' }}
          </p>
          <p v-else>Niet verplicht</p>
        </div>
      </div>

      <!-- KIA Card -->
      <div :class="[
        'rvo-card',
        'rvo-card--outline',
        'rvo-card--padding-md',
        kiaResult && kiaResult.required
          ? 'rvo-card--full-colour--hemelblauw'
          : 'rvo-card--full-colour--grijs-100'
      ]">
        <div class="rvo-card__content card-content-flex">
          <h2 class="utrecht-heading-2" :class="kiaResult && kiaResult.required ? 'font-white' : 'font-hemelblauw'">KIA
          </h2>
          <p v-if="calculationStore.isCalculating">Berekenen...</p>
          <p v-else-if="kiaResult" :class="{ 'font-white': kiaResult.required }">
            {{ kiaResult.required ? kiaResult.explanation : 'Niet verplicht' }}
          </p>
          <p v-else>Niet verplicht</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { FormType } from '../models/dpia'
import { usePreScanReferences, type PreScanReference } from '../composables/usePreScanReferences'
import { useAnswerStore, type AnswerValue } from '../stores/answers'
import { useTaskStore } from '../stores/tasks'
import UiAccordion from './ui/UiAccordion.vue'
import '@nldd/design-system/title'

const props = defineProps<{
  dpiaTaskId: string
}>()

const answerStore = useAnswerStore()
const taskStore = useTaskStore()

interface PreScanDataItem {
  taskId: string;
  taskTitle: string;
  answer: AnswerValue;
}

const { getPreviewDataForSection } = usePreScanReferences()
const preScanAnswers = ref<PreScanDataItem[]>([])
const hasPreScanData = computed(() => preScanAnswers.value.length > 0)

// Load Pre-scan answers that reference this DPIA section
const loadPreScanAnswers = () => {
  preScanAnswers.value = getPreviewDataForSection(props.dpiaTaskId)
}


onMounted(loadPreScanAnswers)
watch(() => props.dpiaTaskId, loadPreScanAnswers)

// Format answer for display
const formatAnswer = (answer: AnswerValue): string => {
  if (answer === null || answer === undefined) {
    return '';
  }

  if (Array.isArray(answer)) {
    return answer.join(', ');
  }

  if (answer === 'true') {
    return 'Ja';
  } else if (answer === 'false') {
    return 'Nee';
  }

  if (typeof answer === 'object') {
    return '';
  }

  return answer;
}
</script>
<template>
  <UiAccordion v-if="hasPreScanData" open>
    <template #title>
      <nldd-title size="5">
        <h3>Informatie uit pre-scan</h3>
        <p slot="subtitle">Je hebt in de pre-scan informatie ingevuld die mogelijk relevant is.</p>
      </nldd-title>
    </template>
    <div v-for="item in preScanAnswers" :key="item.taskId">
      <p><strong>{{ item.taskId }}. {{ item.taskTitle }}</strong></p>
      <!-- Pre-scan answers are user input; render as text to prevent stored XSS. -->
      <p>{{ formatAnswer(item.answer) }}</p>
    </div>
  </UiAccordion>
</template>

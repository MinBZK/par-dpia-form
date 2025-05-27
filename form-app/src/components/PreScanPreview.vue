<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { FormType } from '@/models/dpia.ts'
import { usePreScanReferences, type PreScanReference } from '@/composables/usePreScanReferences'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'

const props = defineProps<{
  dpiaTaskId: string
}>()

const answerStore = useAnswerStore()
const taskStore = useTaskStore()

interface PreScanDataItem {
  taskId: string;
  taskTitle: string;
  answer: string | string[] | null;
}

const { getPreviewDataForSection } = usePreScanReferences()
const preScanAnswers = ref<PreScanDataItem[]>([])
const hasPreScanData = computed(() => preScanAnswers.value.length > 0)

// Extract the root task ID from a full task ID
const getRootTaskId = (taskId: string): string => {
  return taskId.split('.')[0];
}

// Load Pre-scan answers that reference this DPIA section
const loadPreScanAnswers = () => {
  preScanAnswers.value = getPreviewDataForSection(props.dpiaTaskId)
}


onMounted(loadPreScanAnswers)
watch(() => props.dpiaTaskId, loadPreScanAnswers)

// Format answer for display
const formatAnswer = (answer: string | string[] | null): string => {
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

  return answer;
}
</script>
<template>
  <div v-if="hasPreScanData" class="rvo-accordion">
    <details class="rvo-accordion__item" open>
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
            Informatie uit pre-scan
          </h3>
          <div class="rvo-accordion-teaser">Je hebt in de pre-scan informatie ingevuld die mogelijk
            relevant is.</div>
        </div>
      </summary>
      <div class="rvo-accordion__content">
        <div v-for="item in preScanAnswers" :key="item.taskId">
          <p><strong>{{ item.taskId }}. {{ item.taskTitle }}</strong></p>
          <p v-html="formatAnswer(item.answer)"></p>
        </div>
      </div>
    </details>
  </div>
</template>

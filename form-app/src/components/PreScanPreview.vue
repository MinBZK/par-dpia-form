<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { FormType } from '@/models/dpia.ts'
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

const preScanAnswers = ref<PreScanDataItem[]>([])
const hasPreScanData = computed(() => preScanAnswers.value.length > 0)

// Extract the root task ID from a full task ID
const getRootTaskId = (taskId: string): string => {
  return taskId.split('.')[0];
}

// Check if a reference (or array of references) contains a reference to the current DPIA section
const hasReferenceToDpiaSection = (reference: string | string[], dpiaRootTaskId: string): boolean => {
  // If reference is an array, check if any of the references' roots match the current DPIA root task ID
  if (Array.isArray(reference)) {
    return reference.some(ref => getRootTaskId(ref.id) === dpiaRootTaskId);
  } else {
    return getRootTaskId(reference.id) === dpiaRootTaskId;
  }

  return false;
}

// Find and load all Pre-scan answers that reference tasks within this DPIA root task section
const loadPreScanAnswers = () => {
  preScanAnswers.value = []
  if (!props.dpiaTaskId) return

  const dpiaRootTaskId = getRootTaskId(props.dpiaTaskId)
  const preScanTasks = Object.values(taskStore.getTasksFromNamespace(FormType.PRE_SCAN))

  for (const task of preScanTasks) {
    if (task.references && task.references.DPIA) {
      // Check if the task references the current DPIA section
      if (hasReferenceToDpiaSection(task.references.DPIA, dpiaRootTaskId)) {
        const instanceIds = taskStore.getInstanceIdsForTaskFromNamespace(FormType.PRE_SCAN, task.id)

        if (instanceIds.length > 0) {
          const answer = answerStore.getAnswerFromNamespace(FormType.PRE_SCAN, instanceIds[0])

          if (answer !== null && answer !== undefined) {
            preScanAnswers.value.push({
              taskId: task.id,
              taskTitle: getPlainTextWithoutDefinitions(task.task),
              answer: answer
            })
          }
        }
      }
    }
  }
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

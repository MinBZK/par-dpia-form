<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { FormType } from '../models/dpia'
import { usePreScanReferences } from '../composables/usePreScanReferences'
import { type AnswerValue } from '../stores/answers'

const props = defineProps<{
  sectionTaskId: string
}>()

interface PreviewItem {
  taskId: string;
  taskTitle: string;
  answer: AnswerValue;
}

interface PreviewGroup {
  namespace: FormType;
  title: string;
  teaser: string;
  items: PreviewItem[];
}

// Wording per source form, so a preview block always names the form the
// answers were taken from.
const GROUP_LABELS: Record<FormType, { title: string; teaser: string }> = {
  [FormType.PRE_SCAN]: {
    title: 'Informatie uit pre-scan',
    teaser: 'Je hebt in de pre-scan informatie ingevuld die mogelijk relevant is.',
  },
  [FormType.DPIA]: {
    title: 'Informatie uit de DPIA',
    teaser: 'Je hebt in de DPIA informatie ingevuld die mogelijk relevant is.',
  },
  [FormType.IAMA]: {
    title: 'Informatie uit het IAMA',
    teaser: 'Je hebt in het IAMA informatie ingevuld die mogelijk relevant is.',
  },
}

// Source forms are listed in a fixed order so the blocks do not move around
// when an answer is added or removed.
const GROUP_ORDER: FormType[] = [FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA]

const { getPreviewDataForSection } = usePreScanReferences()
const previewGroups = ref<PreviewGroup[]>([])
const hasPreviewData = computed(() => previewGroups.value.length > 0)

// Load the answers from other forms that reference this section.
const loadPreviewAnswers = () => {
  const references = getPreviewDataForSection(props.sectionTaskId)
  previewGroups.value = GROUP_ORDER.flatMap((namespace) => {
    const items = references
      .filter((reference) => reference.sourceNamespace === namespace)
      .map(({ taskId, taskTitle, answer }) => ({ taskId, taskTitle, answer }))
    return items.length === 0 ? [] : [{ namespace, ...GROUP_LABELS[namespace], items }]
  })
}

onMounted(loadPreviewAnswers)
watch(() => props.sectionTaskId, loadPreviewAnswers)

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
  <div v-if="hasPreviewData" class="rvo-accordion">
    <details v-for="group in previewGroups" :key="group.namespace" class="rvo-accordion__item" open>
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
          <h3 class="rvo-accordion__item-title utrecht-heading-3 rvo-heading--no-margins rvo-heading--normal">
            {{ group.title }}
          </h3>
          <div class="rvo-accordion-teaser">{{ group.teaser }}</div>
        </div>
      </summary>
      <div class="rvo-accordion__content">
        <div v-for="item in group.items" :key="item.taskId">
          <p><strong>{{ item.taskId }}. {{ item.taskTitle }}</strong></p>
          <!-- Answers from another form are user input; render as text to prevent stored XSS. -->
          <p>{{ formatAnswer(item.answer) }}</p>
        </div>
      </div>
    </details>
  </div>
</template>

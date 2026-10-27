<script setup lang="ts">
import { computed } from 'vue'
import { FormType } from '../models/dpia'
import { useReferences, type PreviewItem } from '../composables/useReferences'
import type { AnswerValue } from '../stores/answers'

// Answers from another form that relate to this section, read-only: the
// pre-scan inside the DPIA, the linked DPIA inside the IAMA and the other way
// round. One block per source form.
const props = defineProps<{
  sectionId: string
}>()

const SOURCES: { namespace: FormType; title: string; teaser: string }[] = [
  {
    namespace: FormType.PRE_SCAN,
    title: 'Informatie uit pre-scan',
    teaser: 'Je hebt in de pre-scan informatie ingevuld die mogelijk relevant is.',
  },
  {
    namespace: FormType.DPIA,
    title: 'Informatie uit de DPIA',
    teaser: 'In de gekoppelde DPIA staat informatie die mogelijk relevant is.',
  },
  {
    namespace: FormType.IAMA,
    title: 'Informatie uit het IAMA',
    teaser: 'In het gekoppelde IAMA staat informatie die mogelijk relevant is.',
  },
]

const { getPreviewDataForSection } = useReferences()

// Computed rather than loaded once: the other form's answers may arrive after
// this section is shown.
const groups = computed(() => {
  const items: PreviewItem[] = getPreviewDataForSection(props.sectionId)
  return SOURCES
    .map((source) => ({ ...source, items: items.filter((item) => item.sourceNamespace === source.namespace) }))
    .filter((group) => group.items.length > 0)
})

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
  <div v-for="group in groups" :key="group.namespace" class="rvo-accordion">
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
          <h3 class="rvo-accordion__item-title utrecht-heading-3 rvo-heading--no-margins rvo-heading--normal">
            {{ group.title }}
          </h3>
          <div class="rvo-accordion-teaser">{{ group.teaser }}</div>
        </div>
      </summary>
      <div class="rvo-accordion__content">
        <div v-for="(item, index) in group.items" :key="`${item.taskId}-${index}`">
          <p><strong>{{ item.taskId }}. {{ item.taskTitle }}</strong></p>
          <!-- Answers from another form are user input; render as text to prevent stored XSS. -->
          <p>{{ formatAnswer(item.answer) }}</p>
        </div>
      </div>
    </details>
  </div>
</template>

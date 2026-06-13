<script setup lang="ts">
import { computed } from 'vue'
import { useReferences, type ReferenceSuggestion } from '../composables/useReferences'
import { type FlatTask } from '../stores/tasks'
import { type AnswerValue } from '../stores/answers'

const props = defineProps<{
  task: FlatTask
}>()

const { getSuggestionsForTask } = useReferences()

const suggestions = computed<ReferenceSuggestion[]>(() => getSuggestionsForTask(props.task))

const formatAnswer = (answer: AnswerValue): string => {
  if (Array.isArray(answer)) return answer.join(', ')
  if (typeof answer !== 'string') return ''
  if (answer === 'true') return 'Ja'
  if (answer === 'false') return 'Nee'
  return answer
}
</script>

<template>
  <div v-if="suggestions.length > 0" class="rvo-margin-block-end--md">
    <div v-for="suggestion in suggestions" :key="suggestion.sourceTaskId"
      class="rvo-alert rvo-alert--warning reference-suggestions__alert">
      <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing" role="img"
        aria-label="Waarschuwing"></span>
      <div class="rvo-alert-text">
        <p><strong>Suggestie uit antwoord op vraag {{ suggestion.sourceTaskId }} – {{ suggestion.sourceTaskTitle }}:</strong></p>
        <p>{{ formatAnswer(suggestion.answer) }}</p>
      </div>
    </div>
  </div>
</template>

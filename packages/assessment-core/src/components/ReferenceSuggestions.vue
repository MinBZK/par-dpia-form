<script setup lang="ts">
import { computed } from 'vue'
import '@nldd/design-system/banner'
import '@nldd/design-system/container'
import '@nldd/design-system/spacer'
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
  <template v-if="suggestions.length > 0">
    <nldd-container gap="8">
      <nldd-banner v-for="suggestion in suggestions" :key="suggestion.sourceTaskId"
        variant="warning"
        class="reference-suggestions__alert"
        :text="`Suggestie uit antwoord op vraag ${suggestion.sourceTaskId} - ${suggestion.sourceTaskTitle}:`"
        :supporting-text="formatAnswer(suggestion.answer)"></nldd-banner>
    </nldd-container>
    <nldd-spacer size="16"></nldd-spacer>
  </template>
</template>

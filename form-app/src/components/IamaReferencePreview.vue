<script setup lang="ts">
import { computed } from 'vue'
import { useIamaReferences, type IamaSuggestion } from '@/composables/useIamaReferences'
import { type FlatTask } from '@/stores/tasks'

const props = defineProps<{
  task: FlatTask
}>()

const { getIamaSuggestionsForTask } = useIamaReferences()

const suggestions = computed<IamaSuggestion[]>(() => getIamaSuggestionsForTask(props.task))

const formatAnswer = (answer: string | string[]): string => {
  if (Array.isArray(answer)) return answer.join(', ')
  if (answer === 'true') return 'Ja'
  if (answer === 'false') return 'Nee'
  return answer
}
</script>

<template>
  <div v-if="suggestions.length > 0" class="rvo-margin-block-end--md">
    <div v-for="suggestion in suggestions" :key="suggestion.sourceTaskId" class="rvo-alert rvo-alert--warning"
      style="display: flex;">
      <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing" role="img"
        aria-label="Waarschuwing"></span>
      <div class="rvo-alert-text">
        <p><strong>Suggestie uit vraag {{ suggestion.sourceTaskId }} – {{ suggestion.sourceTaskTitle }}:</strong></p>
        <p>{{ formatAnswer(suggestion.answer) }}</p>
        <p><em>Let op: dit antwoord is nog niet als voltooid gemarkeerd.</em></p>
      </div>
    </div>
  </div>
</template>

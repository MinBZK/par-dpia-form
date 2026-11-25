<script setup lang="ts">
import { computed } from 'vue'
import { FormType } from '../models/dpia'
import { useReferences, type ReferenceSuggestion } from '../composables/useReferences'
import { type FlatTask } from '../stores/tasks'
import { useAnswerStore, type AnswerValue } from '../stores/answers'
import UiButton from './ui/UiButton.vue'

const props = defineProps<{
  task: FlatTask
  instanceId: string
}>()

const emit = defineEmits<{
  (e: 'adopted'): void
}>()

const { getSuggestionsForTask } = useReferences()
const answerStore = useAnswerStore()

// How a suggestion names the form it comes from.
const FORM_NAMES: Record<FormType, string> = {
  [FormType.PRE_SCAN]: 'de pre-scan',
  [FormType.DPIA]: 'de DPIA',
  [FormType.IAMA]: 'het IAMA',
  [FormType.AIIA]: 'het AIIA',
}

const formatAnswer = (answer: AnswerValue): string => {
  if (Array.isArray(answer)) return answer.join(', ')
  if (typeof answer !== 'string') return ''
  if (answer === 'true') return 'Ja'
  if (answer === 'false') return 'Nee'
  return answer
}

// Adopted answers are added as their own paragraph, so they are matched as one.
const PARAGRAPH = '\n\n'

// LF line endings, no leading blank lines or trailing whitespace. Indentation
// at the start of a line is kept: it carries markdown structure.
const clean = (text: string): string =>
  text.replace(/\r\n/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd()

// For matching only: whitespace at line ends dropped (a hard break does not
// make a paragraph different) and blank lines collapsed to one PARAGRAPH.
const normalize = (text: string): string =>
  clean(text).replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, PARAGRAPH)

interface SuggestionItem extends ReferenceSuggestion {
  // Unique per source question: two forms can use the same question number.
  key: string
  // Where the answer comes from; names the form when that is another one.
  origin: string
  adoptLabel: string
  // Shown in the suggestion ("Ja"/"Nee" for booleans).
  text: string
  // Written to the field: typed text as written, a picked answer as shown.
  adoptText: string
  // Matched against the field text as a whole paragraph.
  needle: string
}

const items = computed<SuggestionItem[]>(() =>
  getSuggestionsForTask(props.task).map((suggestion) => {
    const text = formatAnswer(suggestion.answer)
    const written = suggestion.sourceIsText && typeof suggestion.answer === 'string'
    const adoptText = clean(written ? suggestion.answer as string : text)
    const otherForm = suggestion.scope === 'cross' ? FORM_NAMES[suggestion.sourceNamespace] : null
    return {
      ...suggestion,
      key: `${suggestion.sourceNamespace}:${suggestion.sourceTaskId}`,
      origin: otherForm
        ? `${otherForm}, vraag ${suggestion.sourceTaskId}`
        : `antwoord op vraag ${suggestion.sourceTaskId}`,
      adoptLabel: `Neem antwoord over van vraag ${suggestion.sourceTaskId}`
        + (otherForm ? ` uit ${otherForm}` : ''),
      text,
      adoptText,
      needle: PARAGRAPH + normalize(adoptText) + PARAGRAPH,
    }
  }),
)

// Only free-text areas take over a suggestion, and
// only when the stored answer is text, so no other kind of answer is overwritten.
const storedAnswer = computed(() => answerStore.getAnswer(props.instanceId))
const canAdoptIntoField = computed(() =>
  !!props.task.type?.includes('open_text')
  && (storedAnswer.value == null || typeof storedAnswer.value === 'string'),
)
// LF line endings, as the textarea itself stores them.
const currentText = computed<string>(() =>
  typeof storedAnswer.value === 'string' ? storedAnswer.value.replace(/\r\n/g, '\n') : '')

// The field text padded with paragraph breaks, so every paragraph can be
// matched as PARAGRAPH + text + PARAGRAPH.
const paddedCurrent = computed(() => PARAGRAPH + normalize(currentText.value) + PARAGRAPH)

// Whether the text already stands in the field as a whole paragraph, so a short
// answer like "Ja" inside "Jaarlijks" does not count as adopted.
const canAdopt = (item: SuggestionItem): boolean =>
  canAdoptIntoField.value && item.adoptText !== '' && !paddedCurrent.value.includes(item.needle)

// Appends below the user's text as its own paragraph: trailing blank lines are
// replaced by one, spaces at the end of the last line (a hard break) are kept.
const adopt = (item: SuggestionItem) => {
  const current = currentText.value
  answerStore.setAnswer(
    props.instanceId,
    current.trim() ? current.replace(/(?:\n[ \t]*)*$/, PARAGRAPH) + item.adoptText : item.adoptText,
  )
  emit('adopted')
}
</script>

<template>
  <div v-if="items.length > 0" class="rvo-margin-block-end--md">
    <div v-for="item in items" :key="item.key"
      class="rvo-alert rvo-alert--warning reference-suggestions__alert">
      <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing" role="img"
        aria-label="Waarschuwing"></span>
      <div class="rvo-alert-text">
        <p><strong>Suggestie uit {{ item.origin }} – {{ item.sourceTaskTitle }}:</strong></p>
        <p>{{ item.text }}</p>
        <UiButton v-if="canAdopt(item)" variant="secondary" size="sm" label="Neem antwoord over"
          :ariaLabel="item.adoptLabel" @click="adopt(item)" />
      </div>
    </div>
  </div>
</template>

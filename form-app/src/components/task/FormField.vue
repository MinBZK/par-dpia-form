<script setup lang="ts">
import { computed } from 'vue'
import { TaskTypeValue } from '@/models/dpia.ts'
import { type FlatTask } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'

const props = defineProps<{
  task: FlatTask,
  instance: number,
  label?: string,
  description?: string,
}>()

const answerStore = useAnswerStore()

const currentValue = computed(() => {
  if (answerStore.answers[props.task.id]?.[props.instance]) {
    return answerStore.answers[props.task.id][props.instance].value
  }
  return null
})

const hasType = (typeToCheck: TaskTypeValue): boolean => {
  return props.task.type?.includes(typeToCheck) || false
}

// Text input and textarea handler
const handleTextInput = (event: Event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  answerStore.setAnswer(props.task.id, props.instance, target.value)
}

// Select handler
const handleSelectInput = (event: Event) => {
  const target = event.target as HTMLSelectElement
  answerStore.setAnswer(props.task.id, props.instance, target.value)
}

// File input handler
const handleFileInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  answerStore.setAnswer(props.task.id, props.instance, files)
}

</script>

<template>
  <div v-if="label" class="rvo-form-field__label">
    <label class="rvo-label" :id="`label-${task.id}-${instance}`">
      {{ label }}
    </label>
    <div v-if="description" class="utrecht-form-field-description" id="helperTextId">
      {{ description }}
    </div>
  </div>

  <!-- Text input field -->
  <div v-if="hasType('text_input')" class="field-group">
    <input :id="`field-${task.id}-${instance}`" type="text" class="utrecht-textbox utrecht-textbox--html-input
    utrecht-textbox--lg" dir="auto" :aria-labelledby="label ? `label-${task.id}-${instance}` :
      undefined" :value="currentValue" @input="handleTextInput" />
  </div>

  <!-- Text area -->
  <div v-if="hasType('open_text')" class="rvo-layout-column rvo-layout-gap--xs">
    <textarea :id="`field-${task.id}-${instance}`" class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" rows=10 :value="currentValue"
      @input="handleTextInput"></textarea>
  </div>

  <!-- Select dropdown -->
  <div v-else-if="hasType('select_option')" class="field-group">
    <div class="rvo-select-wrapper">
      <select :id="`field-${task.id}-${instance}`" class="utrecht-select utrecht-select--html-select"
        :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" :value="currentValue"
        @input="handleSelectInput">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
    </div>
  </div>

  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group">
    <input :id="`field-${task.id}-${instance}`" type="date"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>

  <!-- File upload -->
  <!-- TODO: show currentValue -->
  <div v-else-if="hasType('upload_document')" class="field-group">
    <input :id="`field-${task.id}-${instance}`" type="file" class="rvo-file-input"
      :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" multiple @input="handleFileInput" />
  </div>
</template>

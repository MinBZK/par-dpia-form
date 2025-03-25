<script setup lang="ts">
import { computed } from 'vue'
import { TaskTypeValue } from '@/models/dpia.ts'
import { type FlatTask } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import { useTaskDependencies } from '@/composables/useTaskDependencies'


const props = defineProps<{
  task: FlatTask,
  instance: number,
  label?: string,
  description?: string,
}>()

const answerStore = useAnswerStore()

const { getSourceOptions } = useTaskDependencies()

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

// Radio handler
const handleRadioInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  answerStore.setAnswer(props.task.id, props.instance, target.value)
}
</script>

<template>
  <div v-if="label" class="rvo-form-field__label">
    <label class="rvo-label" :id="`label-${task.id}-${instance}`">
      {{ label }}
    </label>
    <div v-if="description" class="utrecht-form-field-description" :id="`description-${task.id}-${instance}`">
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

  <!-- Select radio -->
  <div v-else-if="hasType('radio_option')" class="field-group">
    <div class="rvo-layout-margin-vertical--md">
      <div class="rvo-radio-button__group">
        <label v-for="option in task.options" :key="option.value" class="rvo-radio-button"
          :for="`${task.id}-${instance}-${option.value}`">
          <input :id="`${task.id}-${instance}-${option.value}`" :value="option.value"
            :checked="currentValue === option.value" :name="`group-${task.id}-${instance}`" type="radio"
            class="utrecht-radio-button" @change="handleRadioInput" />
          {{ option.label }}
        </label>
      </div>
    </div>
  </div>

  <!-- Select dropdown -->
  <div v-else-if="hasType('select_option')" class="field-group">
    <div class="rvo-select-wrapper">
      <select :id="`field-${task.id}-${instance}`" class="utrecht-select utrecht-select--html-select"
        :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" :value="currentValue"
        @input="handleSelectInput">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="option.value" :value="option.value">
          {{ option.value }}
        </option>
      </select>
    </div>
  </div>

  <!-- Select checkbox -->
  <div v-else-if="hasType('checkbox_option')" class="field-group">
    <div class="rvo-layout-margin-vertical--md">
      <div class="rvo-checkbox__group">
        <label v-for="option in getSourceOptions(task)" key="option" class="rvo-checkbox rvo-checkbox--not-checked"
          :for="`${task.id}-${instance}-${option}`">
          <input :id="`${task.id}-${instance}-${option}`" :value="option" name="`group-${task.id}-${instance}`"
            class="rvo-checkbox__input" type="checkbox" />
          {{ option }}
        </label>
      </div>
    </div>

  </div>
  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group">
    <input :id="`field-${task.id}-${instance}`" type="date"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instance}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>
</template>

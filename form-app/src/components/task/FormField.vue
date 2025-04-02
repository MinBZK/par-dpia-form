<script setup lang="ts">
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { TaskTypeValue } from '@/models/dpia.ts'
import { useAnswerStore } from '@/stores/answers'
import { type FlatTask } from '@/stores/tasks'
import { computed } from 'vue'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

const answerStore = useAnswerStore()

const { getSourceOptions } = useTaskDependencies()

function converStringValue(value: string | null, typeSpec: string): null | string | boolean {
  if (value === null) return null

  const types = typeSpec.split('|')

  if (value === 'null' && types.includes('null')) return null
  if (types.includes('boolean')) {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return String(value)
}

const currentValue = computed(() => {
  const storedAnswer = answerStore.getAnswer(props.instanceId)

  if (!Array.isArray(storedAnswer) && props.task.valueType && ['boolean', 'boolean|null'].includes(props.task.valueType)) {
    return converStringValue(storedAnswer, props.task.valueType)
  }
  return storedAnswer
})

const hasType = (typeToCheck: TaskTypeValue): boolean => {
  return props.task.type?.includes(typeToCheck) || false
}

// Text input and textarea handler
const handleTextInput = (event: Event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  answerStore.setAnswer(props.instanceId, target.value)
}

// Select handler
const handleSelectInput = (event: Event) => {
  const target = event.target as HTMLSelectElement
  answerStore.setAnswer(props.instanceId, target.value)
}

// Radio handler
const handleRadioInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  answerStore.setAnswer(props.instanceId, target.value)
}

// Checkbox handler
const handleCheckboxInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = target.value
  const isChecked = target.checked
  let selectedValues = [...currentValue.value]

  if (isChecked && value !== null && !selectedValues.includes(value)) {
    selectedValues.push(value)
  } else if (!isChecked && value !== null && selectedValues.includes(value)) {
    selectedValues = selectedValues.filter(item => item != value)
  }
  answerStore.setAnswer(props.instanceId, selectedValues)
}

</script>

<template>
  <div v-if="label" class="rvo-form-field__label">
    <label class="rvo-label" :id="`label-${task.id}-${instanceId}`">
      {{ label }}
    </label>
    <div v-if="description" class="utrecht-form-field-description" answeet :id="`description-${task.id}-${instanceId}`">
      {{ description }}
    </div>
  </div>

  <!-- Text input field -->

  <div v-if="hasType('text_input')" class="field-group">
    <input :id="`field-${task.id}-${instanceId}`" type="text"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>

  <!-- Text area -->
  <div v-if="hasType('open_text')" class="rvo-layout-column rvo-layout-gap--xs">
    <textarea :id="`field-${task.id}-${instanceId}`" class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" rows="5" :value="currentValue"
      @input="handleTextInput"></textarea>
  </div>

  <!-- Select radio -->
  <div v-else-if="hasType('radio_option')" class="field-group">
    <div class="rvo-layout-margin-vertical--md">
      <div class="rvo-radio-button__group">
        <label v-for="option in task.options!" :key="option.value" class="rvo-radio-button"
          :for="`${task.id}-${instanceId}-${option.value}`">
          <input :id="`${task.id}-${instanceId}-${option.value}`" :value="option.value"
            :checked="currentValue === option.value" :name="`group-${task.id}-${instanceId}`" type="radio"
            class="utrecht-radio-button" @change="handleRadioInput" />
          {{ option.label }}
        </label>
      </div>
    </div>
  </div>

  <!-- Select dropdown -->
  <div v-else-if="hasType('select_option')" class="field-group">
    <div class="rvo-select-wrapper">
      <select :id="`field-${task.id}-${instanceId}`" class="utrecht-select utrecht-select--html-select"
        :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
        @input="handleSelectInput">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="option.value" :value="option.value">
          {{ option.value }}
        </option>
      </select>
    </div>
  </div>

  <!-- Select checkbox -->
  <!-- TODO: this now always assumes the options come from a source via a dependency. We need to
    refactor.-->
  <div v-else-if="hasType('checkbox_option')" class="field-group">
    <div class="rvo-layout-margin-vertical--md">
      <div class="rvo-checkbox__group">
        <label v-for="option in getSourceOptions(task)" :key="option" class="rvo-checkbox rvo-checkbox--not-checked"
          :for="`${task.id}-${instanceId}-${option}`">
          <input :id="`${task.id}-${instanceId}-${option}`" :value="option" :checked="currentValue.includes(option)"
            :name="`group-${task.id}-${instance}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          {{ option }}
        </label>
      </div>
    </div>
  </div>

  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group">
    <input :id="`field-${task.id}-${instanceId}`" type="date"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>
</template>

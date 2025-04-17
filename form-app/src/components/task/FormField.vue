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

const { getSourceOptions, getSourceOptionSourceTaskId } = useTaskDependencies()

function convertStringValue(value: string | null, typeSpec: string): null | string | boolean {
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

  // If there is no stored answer but a default value exists, use the default value.
  if (storedAnswer === null && props.task.defaultValue !== undefined) {
    if (props.task.valueType && ['boolean', 'boolean|null'].includes(props.task.valueType)) {
      if (typeof props.task.defaultValue === 'string') {
        return convertStringValue(props.task.defaultValue, props.task.valueType)
      } else {
        return props.task.defaultValue
      }
    }
  }

  // If necessary convert booleans string arrays to correct type.
  if (props.task.valueType && ['boolean', 'boolean|null'].includes(props.task.valueType)) {
    return convertStringValue(storedAnswer as string | null, props.task.valueType)
  } else if (props.task.valueType === 'string[]') {
    if (Array.isArray(storedAnswer)) {
      return storedAnswer
    } else if (storedAnswer) {
      return [storedAnswer]
    } else {
      return []
    }
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
  let selectedValues = Array.isArray(currentValue.value)
    ? [...(currentValue.value as string[])]
    : []

  if (isChecked && value !== null && !selectedValues.includes(value)) {
    selectedValues.push(value)
  } else if (!isChecked && value !== null && selectedValues.includes(value)) {
    selectedValues = selectedValues.filter((item) => item != value)
  }
  answerStore.setAnswer(props.instanceId, selectedValues)
}
</script>

<template>
  <div v-if="label" class="rvo-form-field__label rvo-margin-block-end--xs">
    <label class="rvo-label" :id="`label-${task.id}-${instanceId}`">
      {{ label }}
    </label>
    <div v-if="description" class="utrecht-form-field-description" :id="`description-${task.id}-${instanceId}`">
      {{ description }}
    </div>
  </div>

  <!-- Text input field -->

  <div v-if="hasType('text_input')" class="field-group rvo-margin-block-end--md">
    <input :id="`field-${task.id}-${instanceId}`" type="text"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>

  <!-- Text area -->
  <div v-if="hasType('open_text')" class="rvo-layout-column rvo-layout-gap--xs rvo-margin-block-end--md">
    <textarea :id="`field-${task.id}-${instanceId}`" class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" rows="5"
      :value="currentValue as string | number | readonly string[] | null | undefined"
      @input="handleTextInput"></textarea>
  </div>

  <!-- Select radio -->
  <div v-else-if="hasType('radio_option')" class="field-group rvo-margin-block-end--md">
    <div class="rvo-layout-margin-vertical--md">
      <div class="rvo-radio-button__group">
        <label v-for="option in task.options!" :key="String(option.value || '')" class="rvo-radio-button"
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
  <div v-else-if="hasType('select_option')" class="field-group rvo-margin-block-end--md">
    <div class="rvo-select-wrapper">
      <select :id="`field-${task.id}-${instanceId}`" class="utrecht-select utrecht-select--html-select"
        :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
        @input="handleSelectInput">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="String(option.value || '')" :value="option.value">
          {{ option.value }}
        </option>
      </select>
    </div>
  </div>

  <!-- Select checkbox -->
  <!-- TODO: this now always assumes the options come from a source via a dependency. We need to
    refactor.-->
  <div v-else-if="hasType('checkbox_option')" class="field-group rvo-margin-block-end--md">
    <div v-if="getSourceOptions(task).length > 0" class="rvo-layout-margin-vertical--md">
      <div class="rvo-checkbox__group">
        <label v-for="option in getSourceOptions(task)" :key="option" class="rvo-checkbox rvo-checkbox--not-checked"
          :for="`${task.id}-${instanceId}-${option}`">
          <input :id="`${task.id}-${instanceId}-${option}`" :value="option"
            :checked="!currentValue || (currentValue as string[]).includes(option)"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          {{ option }}
        </label>
      </div>
    </div>
    <div v-else-if="task.options.length > 0" class="rvo-layout-margin-vertical--md">
      <div class="rvo-checkbox__group">
        <label v-for="option in task.options" :key="option.value" class="rvo-checkbox rvo-checkbox--not-checked"
          :for="`${task.id}-${instanceId}-${option.value}`">
          <input :id="`${task.id}-${instanceId}-${option.value}`" :value="option.value"
            :checked="!currentValue? false : (currentValue as string[]).includes(option.value)"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          {{ option.value }}
        </label>
      </div>
    </div>
    <div v-else>Vul eerst vraag {{ getSourceOptionSourceTaskId(task)?.split('.')[0] || '' }} in.</div>
  </div>

  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group rvo-margin-block-end--md">
    <input :id="`field-${task.id}-${instanceId}`" type="date"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>
</template>

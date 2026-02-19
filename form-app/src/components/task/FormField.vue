<script setup lang="ts">
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { TaskTypeValue } from '@/models/dpia'
import { useAnswerStore } from '@/stores/answers'
import { type FlatTask } from '@/stores/tasks'
import { useTaskStore } from '@/stores/tasks'
import { usePreScanReferences } from '@/composables/usePreScanReferences'
import { useRiskCalculation } from '@/composables/useRiskCalculation'
import { computed } from 'vue'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

const answerStore = useAnswerStore()
const taskStore = useTaskStore()
const { getSourceOptions, getDependencySourceTaskId, getValueCopySourceValue } = useTaskDependencies()
const { getPreScanValueForTask } = usePreScanReferences()
const { getRiskCalculationValue } = useRiskCalculation()

function getSourceTaskId(task: FlatTask): string {
  const sourceIdWithPath = getDependencySourceTaskId.value(task);
  return sourceIdWithPath?.split('.')[0] || '';
}

const dependencyTaskName = computed(() => {
  const sourceId = getSourceTaskId(props.task);
  if (!sourceId) return '';

  try {
    const sourceTask = taskStore.taskById(sourceId);
    return sourceTask.task;
  } catch {
    return '';
  }
});


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
  const referencedValue = getPreScanValueForTask(props.task)

  // Check for instance_mapping dependency value copy
  const instanceMappingValue = getValueCopySourceValue.value(props.task, props.instanceId)

  // Check for risk calculation value
  const riskCalculationValue = getRiskCalculationValue.value(props.task, props.instanceId)

  // If there's a risk calculation value, always use it (and update stored answer if different)
  if (riskCalculationValue !== null) {
    if (storedAnswer !== riskCalculationValue) {
      // Update the stored value if it's different
      answerStore.setAnswer(props.instanceId, riskCalculationValue)
    }
    return riskCalculationValue
  }

  // If there's an instance mapping value, always use it (and update stored answer if different)
  if (instanceMappingValue !== null) {
    if (storedAnswer !== instanceMappingValue) {
      // Update the stored value if it's different
      answerStore.setAnswer(props.instanceId, instanceMappingValue)
    }
    return instanceMappingValue
  }

  // If there's a referenced value and no stored answer yet,
  // STORE IT IMMEDIATELY and then return it
  if (referencedValue !== null && storedAnswer === null) {
    // Store the value in the answer store
    answerStore.setAnswer(props.instanceId, String(referencedValue))
    // Return the newly stored value
    return referencedValue
  }

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

function safeString(value: string | boolean | null): string {
  return value !== null ? String(value) : ''
}

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

// Display text styling and content
const getDisplayTextStyle = () => {
  // Default styling for display_text fields (like verwerkingsdoeleinden)
  return 'background-color: #f8f9fa; padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 0.25rem; font-style: italic; color: #495057;'
}

const getDisplayTextContent = () => {
  // For display_text fields (like verwerkingsdoeleinden)
  return currentValue.value || 'Geen waarde beschikbaar'
}
</script>

<template>
  <div v-if="label" class="rvo-form-field__label rvo-margin-block-end--xs">
    <label class="rvo-label" :id="`label-${task.id}-${instanceId}`" v-html="label"></label>
    <div v-if="description" class="utrecht-form-field-description" :id="`description-${task.id}-${instanceId}`">
      <span v-html="description"></span>
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
    <div>
      <div class="rvo-radio-button__group">
        <label v-for="option in task.options!" :key="String(option.value || '')" class="rvo-radio-button"
          :for="`${task.id}-${instanceId}-${option.value}`">
          <input :id="`${task.id}-${instanceId}-${option.value}`" :value="option.value"
            :checked="currentValue === option.value" :name="`group-${task.id}-${instanceId}`" type="radio"
            class="utrecht-radio-button" @change="handleRadioInput" />
          <span v-html="option.label"></span>
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
        <option v-for="option in task.options" :key="String(option.value || '')" :value="option.value"
          v-html="option.value">
        </option>
      </select>
    </div>
  </div>

  <!-- Select checkbox -->
  <!-- TODO: this now always assumes the options come from a source via a dependency. We need to
  refactor.-->
  <div v-else-if="hasType('checkbox_option')" class="field-group rvo-margin-block-end--md">
    <div v-if="getSourceOptions(task).length > 0">
      <div class="rvo-checkbox__group">
        <label v-for="option in getSourceOptions(task)" :key="option" class="rvo-checkbox rvo-checkbox--not-checked"
          :for="`${task.id}-${instanceId}-${option}`">
          <input :id="`${task.id}-${instanceId}-${option}`" :value="option"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(option)"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          <span v-html="option"></span>
        </label>
      </div>
    </div>
    <div v-else-if="task.options && task.options.length > 0">
      <div class="rvo-checkbox__group">
        <label v-for="option in task.options!" :key="safeString(option.value)"
          class="rvo-checkbox rvo-checkbox--not-checked" :for="`${task.id}-${instanceId}-${safeString(option.value)}`">
          <input :id="`${task.id}-${instanceId}-${safeString(option.value)}`" :value="option.value"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value))"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          <span v-html="option.value"></span>
        </label>
      </div>
    </div>
    <div v-else>
      <div v-if="!['0', '18', '19', '20'].includes(getSourceTaskId(task))">
        Vul eerst sectie {{ getSourceTaskId(task) }}: "{{ dependencyTaskName }}" in.
      </div>
      <div v-else>
        Vul eerst sectie "{{ dependencyTaskName }}" in.
      </div>
    </div>
  </div>



  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group rvo-margin-block-end--md">
    <input :id="`field-${task.id}-${instanceId}`" type="date"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>

  <!-- Display text (read-only) -->
  <div v-else-if="hasType('display_text')" class="field-group rvo-margin-block-end--md">
    <div :id="`field-${task.id}-${instanceId}`"
      class="utrecht-paragraph rvo-paragraph rvo-display-text"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined"
      :style="getDisplayTextStyle()">
      {{ getDisplayTextContent() }}
    </div>
  </div>
</template>

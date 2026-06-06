<script setup lang="ts">
import { useTaskDependencies } from '../../composables/useTaskDependencies'
import { TaskTypeValue } from '../../models/dpia'
import { useAnswerStore } from '../../stores/answers'
import { type FlatTask } from '../../stores/tasks'
import { useTaskStore } from '../../stores/tasks'
import { usePrefixQuestionIds } from '../../composables/usePrefixQuestionIds'
import { useReferences } from '../../composables/useReferences'
import ReferenceSuggestions from '../ReferenceSuggestions.vue'
import ImageField from './ImageField.vue'
import { autoGrowTextarea } from '../../utils/autoGrowTextarea'
import { renderMarkdownToHtml } from '../../utils/markdown'
import { computed, ref, onMounted, nextTick, watch } from 'vue'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

const answerStore = useAnswerStore()
const taskStore = useTaskStore()
const { getSourceOptions, getDependencySourceTaskId } = useTaskDependencies()
const { getPrefillValueForTask } = useReferences()

const prefixQuestionIds = usePrefixQuestionIds()

const displayLabel = computed(() => {
  if (!props.label) return props.label
  if (prefixQuestionIds.value && props.task.is_official_id !== false) {
    return `${props.task.id} ${props.label}`
  }
  return props.label
})

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
  } catch (error) {
    return '';
  }
});


function convertStringValue(value: string | null, typeSpec: string): null | string | boolean {
  if (value === null) return null

  const types = typeSpec.split('|')

  if (value === 'null' && types.includes('null')) return null
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  return String(value)
}

const currentValue = computed(() => {
  const storedAnswer = answerStore.getAnswer(props.instanceId)

  const referencedValue = getPrefillValueForTask(props.task)

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
    } else if (typeof props.task.defaultValue === 'string') {
      return props.task.defaultValue
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

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showPreview = ref(false)

const renderedHtml = computed(() => {
  if (!showPreview.value) return ''
  return renderMarkdownToHtml(String(currentValue.value ?? ''))
})

// Re-trigger auto-grow and restore focus when switching back from preview to edit
watch(showPreview, (preview) => {
  if (!preview) {
    nextTick(() => {
      /* istanbul ignore else @preserve -- unreachable: when showPreview turns
         false the textarea (v-if="!showPreview") is always re-rendered before
         this nextTick callback runs, so textareaRef is guaranteed to be set. */
      if (textareaRef.value) {
        autoGrowTextarea(textareaRef.value)
        textareaRef.value.focus()
      }
    })
  }
})

onMounted(() => {
  nextTick(() => {
    if (textareaRef.value) {
      autoGrowTextarea(textareaRef.value)
    }
  })
})

watch(currentValue, () => {
  nextTick(() => {
    if (textareaRef.value) {
      autoGrowTextarea(textareaRef.value)
    }
  })
})

// Text input and textarea handler
const handleTextInput = (event: Event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  answerStore.setAnswer(props.instanceId, target.value)
  if (target instanceof HTMLTextAreaElement) {
    autoGrowTextarea(target)
  }
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
      <span v-html="displayLabel"></span>
    </label>
    <!-- FRIA tag is a link (interactive content) so it must NOT live inside the
         <label> (invalid HTML + pollutes the field's accessible name). Kept as a
         sibling within the same rvo-form-field__label wrapper for visual adjacency. -->
    <a v-if="task.in_fria" class="rvo-tag rvo-tag--info rvo-tag--with-icon"
      href="https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=OJ:L_202401689#art_27"
      target="_blank" rel="noopener noreferrer"
      title="Dit correspondeert met een vereiste uit art. 27 van de AI Verordening"
      style="margin-inline-start: 0.4em; vertical-align: middle; text-decoration: none; gap: 0.25em;">
      art. 27 AI-verordening
      <span class="utrecht-icon rvo-icon rvo-icon-externe-link rvo-icon--sm" role="img" aria-label="Opent in nieuw tabblad"></span>
    </a>
    <button v-if="hasType('open_text')" type="button"
      class="open-text-field__toggle"
      :aria-pressed="showPreview"
      :aria-label="showPreview ? 'Bewerken' : 'Lezen'"
      @click="showPreview = !showPreview">
      <span class="utrecht-icon rvo-icon rvo-icon--sm"
        :class="showPreview ? 'rvo-icon-document-met-potlood' : 'rvo-icon-oog'"></span>
      {{ showPreview ? 'Bewerken' : 'Lezen' }}
    </button>
    <div v-if="description" class="utrecht-form-field-description" :id="`description-${task.id}-${instanceId}`">
      <span v-html="description"></span>
    </div>
  </div>

  <!-- Suggestions from other tasks in the same form that reference this one.
       Renders nothing for forms without intra-form references. -->
  <ReferenceSuggestions :task="task" />

  <!-- Text input field -->
  <div v-if="hasType('text_input')" class="field-group rvo-margin-block-end--md">
    <input :id="`field-${task.id}-${instanceId}`" type="text"
      class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
      @input="handleTextInput" />
  </div>

  <!-- Text area with markdown support -->
  <div v-if="hasType('open_text')" class="open-text-field rvo-margin-block-end--md">
    <textarea v-if="!showPreview" ref="textareaRef" :id="`field-${task.id}-${instanceId}`"
      class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" rows="5"
      :value="currentValue as string | number | readonly string[] | null | undefined"
      @input="handleTextInput"></textarea>

    <div v-else
      class="markdown-preview" dir="auto"
      role="region"
      :aria-label="'Voorbeeld van de opmaak'"
      v-html="renderedHtml">
    </div>
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

  <!-- Multi-select checkboxes in scrollable container -->
  <div v-else-if="hasType('multiselect_scrollable')" class="field-group rvo-margin-block-end--md">
    <div class="multiselect-scrollable">
      <div class="rvo-checkbox__group">
        <label v-for="option in task.options!" :key="safeString(option.value)"
          class="rvo-checkbox rvo-checkbox--not-checked multiselect-scrollable__option" :for="`${task.id}-${instanceId}-ms-${safeString(option.value)}`">
          <input :id="`${task.id}-${instanceId}-ms-${safeString(option.value)}`" :value="option.value"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value))"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput" class="rvo-checkbox__input"
            type="checkbox" />
          <span>{{ option.value }}</span>
        </label>
      </div>
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
          <!-- option is a user free-text answer (getSourceOptions): render as text, not v-html. -->
          <span>{{ option }}</span>
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
    <div v-else class="rvo-text--error">
      <div v-if="!['0', '18', '19', '20'].includes(getSourceTaskId(task))">
        Vul eerst sectie {{ getSourceTaskId(task) }} "{{ dependencyTaskName }}" in.
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

  <!-- Image upload -->
  <ImageField v-else-if="hasType('image')" :task="task" :instanceId="instanceId" :label="label" :description="description" />
</template>

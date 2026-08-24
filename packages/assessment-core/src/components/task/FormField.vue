<script setup lang="ts">
import { useTaskDependencies } from '../../composables/useTaskDependencies'
import { type Option, TaskTypeValue } from '../../models/dpia'
import { useAnswerStore } from '../../stores/answers'
import { type FlatTask } from '../../stores/tasks'
import { useTaskStore } from '../../stores/tasks'
import { usePrefixQuestionIds } from '../../composables/usePrefixQuestionIds'
import { useReferences } from '../../composables/useReferences'
import ReferenceSuggestions from '../ReferenceSuggestions.vue'
import ImageField from './ImageField.vue'
import { renderMarkdownToHtml } from '../../utils/markdown'
import { getPlainTextWithoutDefinitions } from '../../utils/stripHtml'
import { CONTENT_READONLY_KEY } from '../../injectionKeys'
import { computed, inject, ref, nextTick, watch } from 'vue'
import '@nldd/design-system/text-field'
import '@nldd/design-system/multi-line-text-field'
import '@nldd/design-system/dropdown'
import '@nldd/design-system/date-field'
import '@nldd/design-system/toggle-button'
import '@nldd/design-system/icon'
import '@nldd/design-system/rich-text'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

// Read-only role: only the inputs go inert, so the term tooltips in the label
// and the description stay hoverable.
const readonly = inject(CONTENT_READONLY_KEY, ref(false))

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

// Shadow-DOM inputs cannot reference the light-DOM label via aria-labelledby;
// they get the plain label text as accessible-label instead.
const accessibleLabel = computed(() =>
  props.label ? getPlainTextWithoutDefinitions(displayLabel.value) : undefined,
)

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

// The label carries the definition markup; the value stays the stored answer.
function optionLabel(option: Option): string {
  return option.label ?? safeString(option.value)
}

const hasType = (typeToCheck: TaskTypeValue): boolean => {
  return props.task.type?.includes(typeToCheck) || false
}

// focus() is optional: it only exists once the custom element is upgraded
// (not in jsdom unit tests).
type TextAreaElement = HTMLElement & { focus?: (options?: FocusOptions) => void }

const textareaRef = ref<TextAreaElement | null>(null)
const showPreview = ref(false)

const renderedHtml = computed(() => {
  if (!showPreview.value) return ''
  return renderMarkdownToHtml(String(currentValue.value ?? ''))
})

// Restore focus to the textarea when switching back from preview to edit
watch(showPreview, (preview) => {
  if (!preview) {
    nextTick(() => {
      textareaRef.value?.focus?.()
    })
  }
})

// Text input and textarea handler (NLDD fields deliver the value in
// event.detail; fall back to target.value for native inputs)
const handleTextInput = (event: Event) => {
  const detail = (event as CustomEvent<{ value?: string }>).detail
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  answerStore.setAnswer(props.instanceId, detail?.value ?? target.value)
}

// nldd-toggle-button flips `selected` itself before it emits change.
const handlePreviewToggle = (event: Event) => {
  const detail = (event as CustomEvent<{ selected?: boolean }>).detail
  showPreview.value = detail?.selected ?? !showPreview.value
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
  <div v-if="label" class="form-field__label">
    <label :id="`label-${task.id}-${instanceId}`">
      <span v-html="displayLabel"></span>
    </label>
    <!-- FRIA tag is a link (interactive content) so it must NOT live inside the
         <label> (invalid HTML + pollutes the field's accessible name). Kept as a
         sibling within the same form-field__label wrapper for visual adjacency. -->
    <a v-if="task.in_fria" class="form-field__fria-tag"
      href="https://eur-lex.europa.eu/legal-content/NL/TXT/HTML/?uri=OJ:L_202401689#art_27"
      target="_blank" rel="noopener noreferrer"
      title="Dit correspondeert met een vereiste uit art. 27 van de AI Verordening">
      art. 27 AI-verordening
      <nldd-icon name="square-arrow-right-top" size="16" aria-hidden="false" aria-label="Opent in nieuw tabblad"></nldd-icon>
    </a>
    <div v-if="description" class="form-field__description" :id="`description-${task.id}-${instanceId}`">
      <span v-html="description"></span>
    </div>
  </div>

  <!-- Suggestions from other tasks in the same form that reference this one.
       Renders nothing for forms without intra-form references. -->
  <ReferenceSuggestions :task="task" />

  <!-- Text input field -->
  <div v-if="hasType('text_input')" class="field-group" :inert="readonly || undefined">
    <nldd-text-field :input-id="`field-${task.id}-${instanceId}`" dir="auto"
      :accessible-label="accessibleLabel" :value="currentValue"
      @input="handleTextInput"></nldd-text-field>
  </div>

  <!-- Text area with markdown support -->
  <div v-if="hasType('open_text')" class="open-text-field field-group">
    <!-- The switch belongs to the box it changes, so it sits on top of it
         rather than at the far end of the question. -->
    <div class="open-text-field__bar">
      <nldd-toggle-button size="xs"
        class="open-text-field__toggle"
        :selected="showPreview"
        :text="showPreview ? 'Bewerken' : 'Lezen'"
        :icon="showPreview ? 'pencil-on-square' : 'eye'"
        @change="handlePreviewToggle"></nldd-toggle-button>
    </div>
    <nldd-multi-line-text-field v-if="!showPreview" ref="textareaRef"
      :inert="readonly || undefined"
      :input-id="`field-${task.id}-${instanceId}`" dir="auto"
      :accessible-label="accessibleLabel" rows="5" resize="auto"
      :value="safeString(currentValue as string | boolean | null)"
      @input="handleTextInput"></nldd-multi-line-text-field>

    <!-- nldd-rich-text is light DOM, so rich-text.css styles the markdown
         that v-html drops in here. -->
    <nldd-rich-text v-else spacing="tight"
      class="markdown-preview" dir="auto"
      role="region"
      :aria-label="'Voorbeeld van de opmaak'"
      v-html="renderedHtml">
    </nldd-rich-text>
  </div>

  <!-- Select radio -->
  <div v-else-if="hasType('radio_option')" class="field-group" :inert="readonly || undefined">
    <div>
      <div class="form-field__choices" role="radiogroup" :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined">
        <label v-for="option in task.options!" :key="String(option.value || '')" class="form-field__choice"
          :for="`${task.id}-${instanceId}-${option.value}`">
          <input :id="`${task.id}-${instanceId}-${option.value}`" :value="option.value"
            :checked="currentValue === option.value" :name="`group-${task.id}-${instanceId}`" type="radio"
            @change="handleRadioInput" />
          <span v-html="optionLabel(option)"></span>
        </label>
      </div>
    </div>
  </div>

  <!-- Select dropdown -->
  <div v-else-if="hasType('select_option')" class="field-group" :inert="readonly || undefined">
    <nldd-dropdown>
      <select :id="`field-${task.id}-${instanceId}`"
        :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined" :value="currentValue"
        @input="handleSelectInput">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="String(option.value || '')" :value="option.value"
          v-html="option.value">
        </option>
      </select>
    </nldd-dropdown>
  </div>

  <!-- Multi-select checkboxes in scrollable container -->
  <div v-else-if="hasType('multiselect_scrollable')" class="field-group" :inert="readonly || undefined">
    <div class="multiselect-scrollable">
      <div class="form-field__choices">
        <label v-for="option in task.options!" :key="safeString(option.value)"
          class="form-field__choice multiselect-scrollable__option" :for="`${task.id}-${instanceId}-ms-${safeString(option.value)}`">
          <input :id="`${task.id}-${instanceId}-ms-${safeString(option.value)}`" :value="option.value"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value))"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput"
            type="checkbox" />
          <span>{{ option.value }}</span>
        </label>
      </div>
    </div>
  </div>

  <!-- Select checkbox -->
  <!-- TODO: this now always assumes the options come from a source via a dependency. We need to
  refactor.-->
  <div v-else-if="hasType('checkbox_option')" class="field-group" :inert="readonly || undefined">
    <div v-if="getSourceOptions(task).length > 0">
      <div class="form-field__choices">
        <label v-for="option in getSourceOptions(task)" :key="option" class="form-field__choice"
          :for="`${task.id}-${instanceId}-${option}`">
          <input :id="`${task.id}-${instanceId}-${option}`" :value="option"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(option)"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput"
            type="checkbox" />
          <!-- option is a user free-text answer (getSourceOptions): render as text, not v-html. -->
          <span>{{ option }}</span>
        </label>
      </div>
    </div>
    <div v-else-if="task.options && task.options.length > 0">
      <div class="form-field__choices">
        <label v-for="option in task.options!" :key="safeString(option.value)"
          class="form-field__choice" :for="`${task.id}-${instanceId}-${safeString(option.value)}`">
          <input :id="`${task.id}-${instanceId}-${safeString(option.value)}`" :value="option.value"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value))"
            :name="`group-${task.id}-${instanceId}`" @change="handleCheckboxInput"
            type="checkbox" />
          <span v-html="optionLabel(option)"></span>
        </label>
      </div>
    </div>
    <div v-else class="form-field__error">
      <div v-if="!['0', '18', '19', '20'].includes(getSourceTaskId(task))">
        Vul eerst sectie {{ getSourceTaskId(task) }} "{{ dependencyTaskName }}" in.
      </div>
      <div v-else>
        Vul eerst sectie "{{ dependencyTaskName }}" in.
      </div>
    </div>
  </div>



  <!-- Date input: value is ISO yyyy-mm-dd both ways. Bound to change, not
       input: the calendar picker only emits change, and input would write ''
       to the store on every partial keystroke. -->
  <div v-else-if="hasType('date')" class="field-group" :inert="readonly || undefined">
    <nldd-date-field :input-id="`field-${task.id}-${instanceId}`"
      :accessible-label="accessibleLabel" :value="currentValue"
      @change="handleTextInput"></nldd-date-field>
  </div>

  <!-- Image upload -->
  <ImageField v-else-if="hasType('image')" :task="task" :instanceId="instanceId" :label="label" :description="description" />
</template>

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
import '@nldd/design-system/segmented-control'
import '@nldd/design-system/icon'
import '@nldd/design-system/rich-text'
import '@nldd/design-system/inline-dialog'
import '@nldd/design-system/radio-button-group'
import '@nldd/design-system/radio-button-field'
import '@nldd/design-system/checkbox-field'
import '@nldd/design-system/checkbox'
import '@nldd/design-system/radio-button'

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

// Sections 0 and 18-20 carry no number the reader would recognise, so those
// are named without one.
const dependencyMessage = computed(() => {
  const id = getSourceTaskId(props.task)
  return ['0', '18', '19', '20'].includes(id)
    ? `Vul eerst sectie "${dependencyTaskName.value}" in.`
    : `Vul eerst sectie ${id} "${dependencyTaskName.value}" in.`
})



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

// The segmented control reports which of the two modes is now chosen.
const handlePreviewToggle = (event: Event) => {
  const detail = (event as CustomEvent<{ value?: string }>).detail
  if (detail?.value) showPreview.value = detail.value === 'lezen'
}

// Select handler
const handleSelectInput = (event: Event) => {
  const target = event.target as HTMLSelectElement
  answerStore.setAnswer(props.instanceId, target.value)
}

// Radio handler
// The bare radio reports its own state; only the newly checked one matters.
const handleRadioButtonChange = (event: Event, value: unknown) => {
  const checked = (event as CustomEvent<{ checked?: boolean }>).detail?.checked
  if (checked) answerStore.setAnswer(props.instanceId, value as string)
}

// nldd-checkbox-field reports the new state in the change detail; the inner
// nldd-checkbox re-emits through the shadow boundary, so setting the state from
// the payload (rather than toggling) keeps the duplicate harmless.
const handleCheckboxFieldChange = (event: Event, value: string) => {
  const checked = (event as CustomEvent<{ checked?: boolean }>).detail?.checked
  if (checked === undefined) return
  const current = Array.isArray(currentValue.value) ? [...(currentValue.value as string[])] : []
  const next = checked
    ? (current.includes(value) ? current : [...current, value])
    : current.filter((v) => v !== value)
  answerStore.setAnswer(props.instanceId, next)
}

// A definition tooltip in a choice label is markup, and markup cannot cross the
// shadow-DOM boundary of nldd-radio-button-field, which takes plain text only.
// Options without it -- every yes/no question -- get the design system's group,
// which brings arrow-key navigation and mutual exclusion of its own.
const plainRadioOptions = computed(() =>
  (props.task.options ?? []).every((option) => !optionLabel(option).includes('<')),
)

// The group re-emits the field's change, so one click arrives twice; reading
// the value (rather than toggling) makes the duplicate harmless.
const handleRadioGroupChange = (event: Event) => {
  const value = (event as CustomEvent<{ value?: string }>).detail?.value
  if (value !== undefined) answerStore.setAnswer(props.instanceId, value)
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
      <nldd-segmented-control size="sm" width="fit-content" variant="icon-and-text"
        class="open-text-field__toggle" accessible-label="Weergave van dit veld"
        :value="showPreview ? 'lezen' : 'bewerken'"
        @change="handlePreviewToggle">
        <nldd-segmented-control-item value="bewerken" text="Bewerken"
          icon="pencil-on-square"></nldd-segmented-control-item>
        <nldd-segmented-control-item value="lezen" text="Lezen"
          icon="eye"></nldd-segmented-control-item>
      </nldd-segmented-control>
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
      <nldd-radio-button-group v-if="plainRadioOptions" :name="`group-${task.id}-${instanceId}`"
        :accessible-labeled-by="label ? `label-${task.id}-${instanceId}` : undefined"
        @change="handleRadioGroupChange">
        <nldd-radio-button-field v-for="option in task.options!" :key="String(option.value || '')"
          :value="safeString(option.value)" :label="optionLabel(option)"
          :checked="currentValue === option.value || undefined"></nldd-radio-button-field>
      </nldd-radio-button-group>
      <div v-else class="form-field__choices" role="radiogroup" :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined">
        <!-- Same split as the checkboxes: the design system draws the control,
             the label stays in light DOM because it carries definition markup. -->
        <label v-for="option in task.options!" :key="String(option.value || '')" class="form-field__choice">
          <nldd-radio-button :value="safeString(option.value)"
            :name="`group-${task.id}-${instanceId}`"
            :accessible-label="getPlainTextWithoutDefinitions(optionLabel(option))"
            :checked="currentValue === option.value || undefined"
            @change="handleRadioButtonChange($event, option.value)"></nldd-radio-button>
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
        <nldd-checkbox-field v-for="option in task.options!" :key="safeString(option.value)"
          class="multiselect-scrollable__option" :label="safeString(option.value)"
          :value="safeString(option.value)" :name="`group-${task.id}-${instanceId}`"
          :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value)) || undefined"
          @change="handleCheckboxFieldChange($event, safeString(option.value))"></nldd-checkbox-field>
      </div>
    </div>
  </div>

  <!-- Select checkbox -->
  <!-- TODO: this now always assumes the options come from a source via a dependency. We need to
  refactor.-->
  <div v-else-if="hasType('checkbox_option')" class="field-group" :inert="readonly || undefined">
    <div v-if="getSourceOptions(task).length > 0">
      <div class="form-field__choices">
        <!-- option is a user free-text answer (getSourceOptions), so it is plain
             text and the design system's field can carry it. -->
        <nldd-checkbox-field v-for="option in getSourceOptions(task)" :key="option"
          :label="option" :value="option" :name="`group-${task.id}-${instanceId}`"
          :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(option) || undefined"
          @change="handleCheckboxFieldChange($event, option)"></nldd-checkbox-field>
      </div>
    </div>
    <div v-else-if="task.options && task.options.length > 0">
      <div class="form-field__choices">
        <!-- The box is the design system's; the label stays in light DOM because
             it carries definition markup, which cannot cross the shadow-DOM
             boundary. accessible-label gives the control the plain text. -->
        <label v-for="option in task.options!" :key="safeString(option.value)"
          class="form-field__choice">
          <nldd-checkbox :value="safeString(option.value)"
            :name="`group-${task.id}-${instanceId}`"
            :accessible-label="getPlainTextWithoutDefinitions(optionLabel(option))"
            :checked="Array.isArray(currentValue) && (currentValue as string[]).includes(safeString(option.value)) || undefined"
            @change="handleCheckboxFieldChange($event, safeString(option.value))"></nldd-checkbox>
          <span v-html="optionLabel(option)"></span>
        </label>
      </div>
    </div>
    <!-- Not an error the reader made: this field simply has nothing to show
         until another section is filled in. An inline dialog says that as a
         status, with the icon and the announcement that plain red text lacks. -->
    <nldd-inline-dialog v-else class="form-field__dependency"
      icon="arrow-up" icon-color="secondary"
      text="Deze vraag wacht op een eerdere sectie"
      :supporting-text="dependencyMessage"></nldd-inline-dialog>
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

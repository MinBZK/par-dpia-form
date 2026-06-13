<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { autoGrowTextarea } from '../../utils/autoGrowTextarea'
import { renderMarkdownToHtml } from '../../utils/markdown'
import { applyMarkdownCommand, type MarkdownCommand } from '../../utils/markdownCommands'
import MarkdownToolbar from './MarkdownToolbar.vue'

// The editor surface for open_text fields. It owns the markdown text, the
// formatting toolbar, and the read/edit toggle, and exposes a stable contract
// (modelValue is the canonical markdown string). This abstraction decouples the
// call sites from the concrete surface so a richer editor — and later a shared
// Y.Text for realtime collaboration — can replace the textarea without touching
// consumers.
const props = defineProps<{
  modelValue: string
  inputId?: string
  ariaLabelledby?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const showPreview = ref(false)

const renderedHtml = computed(() => (showPreview.value ? renderMarkdownToHtml(props.modelValue) : ''))

function growTextarea() {
  nextTick(() => {
    if (textareaRef.value) autoGrowTextarea(textareaRef.value)
  })
}

onMounted(growTextarea)
watch(() => props.modelValue, growTextarea)

// Re-grow and restore focus when switching back from preview to edit mode.
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

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
  autoGrowTextarea(target)
}

function handleCommand(command: MarkdownCommand) {
  const textarea = textareaRef.value
  /* istanbul ignore else @preserve -- unreachable: the toolbar only renders in
     edit mode (v-if="!showPreview"), where the textarea is always mounted. */
  if (textarea) {
    const result = applyMarkdownCommand(command, {
      text: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
    })
    emit('update:modelValue', result.text)
    nextTick(() => {
      const ta = textareaRef.value
      /* istanbul ignore else @preserve -- unreachable: still in edit mode after
         applying a command, so the textarea remains mounted. */
      if (ta) {
        ta.focus()
        ta.setSelectionRange(result.selectionStart, result.selectionEnd)
        autoGrowTextarea(ta)
      }
    })
  }
}
</script>

<template>
  <div class="open-text-field rvo-margin-block-end--md">
    <div class="open-text-field__header">
      <MarkdownToolbar v-if="!showPreview" @command="handleCommand" />
      <button type="button" class="open-text-field__toggle"
        :aria-pressed="showPreview"
        :aria-label="showPreview ? 'Bewerken' : 'Lezen'"
        @click="showPreview = !showPreview">
        <span class="utrecht-icon rvo-icon rvo-icon--sm"
          :class="showPreview ? 'rvo-icon-document-met-potlood' : 'rvo-icon-oog'"></span>
        {{ showPreview ? 'Bewerken' : 'Lezen' }}
      </button>
    </div>

    <textarea v-if="!showPreview" ref="textareaRef" :id="inputId"
      class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"
      :aria-labelledby="ariaLabelledby" rows="5"
      :value="modelValue" @input="handleInput"></textarea>

    <div v-else class="markdown-preview" dir="auto" role="region"
      :aria-label="'Voorbeeld van de opmaak'" v-html="renderedHtml"></div>
  </div>
</template>

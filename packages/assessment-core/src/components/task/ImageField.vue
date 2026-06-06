<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { autoGrowTextarea } from '../../utils/autoGrowTextarea'
import { useAnswerStore, isImageValue, type ImageValue } from '../../stores/answers'
import { type FlatTask } from '../../stores/tasks'
import { resizeImageToDataUri } from '../../utils/imageResize'
import UiButton from '../ui/UiButton.vue'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

const answerStore = useAnswerStore()
const fileInput = ref<HTMLInputElement | null>(null)
const isProcessing = ref(false)
const errorMessage = ref<string | null>(null)
const isDragging = ref(false)

const currentValue = computed(() => answerStore.getAnswer(props.instanceId))

const imageData = computed((): ImageValue | null => {
  const val = currentValue.value
  if (isImageValue(val)) return val
  return null
})

// Legacy string value (old URL reference from when this was a text_input)
const legacyValue = computed((): string | null => {
  const val = currentValue.value
  if (typeof val === 'string' && !val.startsWith('data:image/')) return val
  return null
})

const legacyIsUrl = computed(() => {
  try {
    return legacyValue.value ? new URL(legacyValue.value).protocol.startsWith('http') : false
  } catch { return false }
})

const hasImage = computed(() => imageData.value !== null)

function saveImageValue(updates: Partial<ImageValue>) {
  const current = imageData.value
  const merged: ImageValue = {
    data: updates.data ?? current?.data ?? '',
    ...(updates.title ?? current?.title ? { title: updates.title ?? current?.title } : {}),
    ...(updates.description ?? current?.description ? { description: updates.description ?? current?.description } : {}),
    ...(updates.source ?? current?.source ? { source: updates.source } : {}),
  }
  answerStore.setAnswer(props.instanceId, merged)
}

function updateMetadata(field: 'title' | 'description' | 'source', value: string) {
  const trimmed = value.trim()
  const current = imageData.value
  if (!current) return

  const updated: ImageValue = { ...current }
  if (trimmed) {
    updated[field] = trimmed
  } else {
    delete updated[field]
  }
  answerStore.setAnswer(props.instanceId, updated)
}

async function processFile(file: File) {
  isProcessing.value = true
  errorMessage.value = null

  try {
    const dataUri = await resizeImageToDataUri(file)
    const source = (legacyIsUrl.value ? legacyValue.value : null) || imageData.value?.source
    saveImageValue({
      data: dataUri,
      ...(source ? { source } : {}),
    })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Er is een fout opgetreden.'
  } finally {
    isProcessing.value = false
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await processFile(file)
  // Reset file input so the same file can be re-selected.
  input.value = ''
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function handleDragOver() {
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function triggerFileSelect() {
  fileInput.value?.click()
}

const descriptionRef = ref<HTMLTextAreaElement | null>(null)

watch(() => imageData.value?.description, () => {
  nextTick(() => {
    if (descriptionRef.value) {
      autoGrowTextarea(descriptionRef.value)
    }
  })
})
</script>

<template>
  <div class="field-group rvo-margin-block-end--md">
    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
      hidden
      :aria-label="label ? undefined : 'Afbeelding uploaden'"
      :aria-labelledby="label ? `label-${task.id}-${instanceId}` : undefined"
      @change="handleFileSelect"
    />

    <!-- Legacy string/URL reference -->
    <div v-if="legacyValue" class="rvo-alert rvo-alert--warning rvo-alert--padding-sm rvo-margin-block-end--md">
      <p>Bestaande referentie:
        <a v-if="legacyIsUrl" :href="legacyValue" target="_blank" rel="noopener">{{ legacyValue }}</a>
        <span v-else>{{ legacyValue }}</span>
      </p>
      <p>Upload een afbeelding om deze referentie te vervangen.</p>
    </div>

    <!-- Processing indicator -->
    <p v-if="isProcessing" role="status" aria-live="polite">Bezig met verwerken...</p>

    <!-- Error message -->
    <div v-if="errorMessage" class="rvo-alert rvo-alert--warning rvo-alert--inline rvo-margin-block-end--md" role="alert">
      <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing"
        role="img" aria-hidden="true"></span>
      {{ errorMessage }}
    </div>

    <!-- Image preview (also accepts drag & drop to replace) -->
    <div v-if="hasImage" class="rvo-margin-block-end--md"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <div class="image-replace-target">
        <img
          :src="imageData!.data"
          :alt="imageData!.title || task.task"
          class="image-preview"
        />
        <div v-if="isDragging" class="image-replace-overlay">Sleep een afbeelding hierheen om de huidige afbeelding te vervangen</div>
      </div>

      <UiButton variant="secondary" label="Vervang afbeelding" class="rvo-margin-block-end--md" @click="triggerFileSelect" />

      <!-- Metadata fields (only shown when an image is uploaded) -->
      <div class="rvo-layout-column rvo-layout-gap--xs">
        <div class="rvo-form-field__label">
          <label class="rvo-label" :for="`image-title-${instanceId}`">Titel (optioneel)</label>
        </div>
        <input
          :id="`image-title-${instanceId}`"
          type="text"
          class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg"
          dir="auto"
          placeholder="Bijv. Architectuurdiagram gegevensverwerking"
          :value="imageData!.title || ''"
          @change="updateMetadata('title', ($event.target as HTMLInputElement).value)"
        />

        <div class="rvo-form-field__label">
          <label class="rvo-label" :for="`image-description-${instanceId}`">Omschrijving (optioneel)</label>
        </div>
        <textarea
          ref="descriptionRef"
          :id="`image-description-${instanceId}`"
          class="utrecht-textarea utrecht-textarea--html-textarea"
          dir="auto"
          rows="2"
          placeholder="Bijv. Overzicht van datastromen tussen systemen"
          :value="imageData!.description || ''"
          @change="updateMetadata('description', ($event.target as HTMLTextAreaElement).value)"
          @input="autoGrowTextarea($event.target as HTMLTextAreaElement)"
        ></textarea>

        <div class="rvo-form-field__label">
          <label class="rvo-label" :for="`image-source-${instanceId}`">Bron (optioneel)</label>
        </div>
        <input
          :id="`image-source-${instanceId}`"
          type="text"
          class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg"
          dir="auto"
          placeholder="Bijv. Projectplan v3, SharePoint"
          :value="imageData!.source || ''"
          @change="updateMetadata('source', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- Upload dropzone (shown when no image) -->
    <div v-if="!hasImage && !isProcessing"
      class="image-dropzone"
      :class="{ 'image-dropzone--active': isDragging }"
      @click="triggerFileSelect"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      role="button"
      tabindex="0"
      :aria-describedby="label ? `label-${task.id}-${instanceId}` : undefined"
      @keydown.enter="triggerFileSelect"
      @keydown.space.prevent="triggerFileSelect"
    >
      Sleep een afbeelding hierheen of klik om te uploaden
    </div>
  </div>
</template>

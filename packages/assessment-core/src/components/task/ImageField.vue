<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { CONTENT_READONLY_KEY } from '../../injectionKeys'
import { useAnswerStore, isImageValue, type ImageValue } from '../../stores/answers'
import { type FlatTask } from '../../stores/tasks'
import { resizeImageToDataUri } from '../../utils/imageResize'
import '@nldd/design-system/banner'
import '@nldd/design-system/button'
import '@nldd/design-system/container'
import '@nldd/design-system/form-field'
import '@nldd/design-system/text-field'
import '@nldd/design-system/multi-line-text-field'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
}>()

const answerStore = useAnswerStore()
// Read-only role: the upload controls go inert, the preview stays visible.
const readonly = inject(CONTENT_READONLY_KEY, ref(false))

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

// NLDD fields deliver the committed value in event.detail; fall back to
// target.value for native inputs.
function fieldValue(event: Event): string {
  const detail = (event as CustomEvent<{ value?: string }>).detail
  return detail?.value ?? (event.target as HTMLInputElement).value
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
</script>

<template>
  <div class="field-group" :inert="readonly || undefined">
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
    <nldd-banner v-if="legacyValue" variant="warning" class="image-field__block">
      <p>Bestaande referentie:
        <a v-if="legacyIsUrl" :href="legacyValue" target="_blank" rel="noopener noreferrer">{{ legacyValue }}</a>
        <span v-else>{{ legacyValue }}</span>
      </p>
      <p>Upload een afbeelding om deze referentie te vervangen.</p>
    </nldd-banner>

    <!-- Processing indicator -->
    <p v-if="isProcessing" role="status" aria-live="polite">Bezig met verwerken...</p>

    <!-- Error message -->
    <nldd-banner v-if="errorMessage" variant="critical" :text="errorMessage" class="image-field__block"></nldd-banner>

    <!-- Image preview (also accepts drag & drop to replace) -->
    <div v-if="hasImage" class="image-field__block"
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

      <nldd-button variant="secondary" text="Vervang afbeelding" class="image-field__block" @click="triggerFileSelect"></nldd-button>

      <!-- Metadata fields (only shown when an image is uploaded) -->
      <nldd-container gap="8">
        <nldd-form-field label="Titel" optional>
          <nldd-text-field
            :input-id="`image-title-${instanceId}`"
            dir="auto"
            placeholder="Bijv. Architectuurdiagram gegevensverwerking"
            :value="imageData!.title || ''"
            @change="updateMetadata('title', fieldValue($event))"
          ></nldd-text-field>
        </nldd-form-field>

        <nldd-form-field label="Omschrijving" optional>
          <nldd-multi-line-text-field
            :input-id="`image-description-${instanceId}`"
            dir="auto"
            rows="2"
            resize="auto"
            placeholder="Bijv. Overzicht van datastromen tussen systemen"
            :value="imageData!.description || ''"
            @change="updateMetadata('description', fieldValue($event))"
          ></nldd-multi-line-text-field>
        </nldd-form-field>

        <nldd-form-field label="Bron" optional>
          <nldd-text-field
            :input-id="`image-source-${instanceId}`"
            dir="auto"
            placeholder="Bijv. Projectplan v3, SharePoint"
            :value="imageData!.source || ''"
            @change="updateMetadata('source', fieldValue($event))"
          ></nldd-text-field>
        </nldd-form-field>
      </nldd-container>
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

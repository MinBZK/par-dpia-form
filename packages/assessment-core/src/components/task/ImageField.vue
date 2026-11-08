<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { CONTENT_READONLY_KEY } from '../../injectionKeys'
import { useAnswerStore, isImageValue, type ImageValue } from '../../stores/answers'
import { type FlatTask } from '../../stores/tasks'
import { resizeImageToDataUri } from '../../utils/imageResize'
import '@nldd/design-system/banner'
import '@nldd/design-system/container'
import '@nldd/design-system/file-field'
import '@nldd/design-system/form-field'
import '@nldd/design-system/text-field'
import '@nldd/design-system/multi-line-text-field'

const props = defineProps<{
  task: FlatTask
  instanceId: string
  label?: string
  description?: string
  accessibleLabel?: string
}>()

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'

const answerStore = useAnswerStore()
// Read-only role: the upload controls go inert, the preview stays visible.
const readonly = inject(CONTENT_READONLY_KEY, ref(false))

const isProcessing = ref(false)
const errorMessage = ref<string | null>(null)

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

const uploadLabel = computed(() => props.accessibleLabel || 'Afbeelding uploaden')

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

async function handleFileChange(event: Event) {
  const file = (event as CustomEvent<{ files?: File[] }>).detail?.files?.[0]
  if (file) {
    await processFile(file)
    return
  }
  // The clear button of the field is the only control that reads as "undo this
  // upload", so an empty change drops the stored image.
  if (hasImage.value) answerStore.removeAnswer(props.instanceId)
}
</script>

<template>
  <div class="field-group" :inert="readonly || undefined">
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

    <nldd-container v-if="hasImage" gap="16">
      <img
        :src="imageData!.data"
        :alt="imageData!.title || task.task"
        class="image-preview"
      />

      <!-- A browser does not let a file input be prefilled, so this field shows
           no file name even though the preview above holds the stored image. -->
      <nldd-file-field
        :accept="ACCEPTED_TYPES"
        :accessible-label="uploadLabel"
        @change="handleFileChange"
      ></nldd-file-field>

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
    </nldd-container>

    <!-- Upload field (shown when no image) -->
    <nldd-file-field
      v-if="!hasImage && !isProcessing"
      variant="area"
      :accept="ACCEPTED_TYPES"
      :accessible-label="uploadLabel"
      @change="handleFileChange"
    ></nldd-file-field>
  </div>
</template>

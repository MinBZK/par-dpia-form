<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { importFromJson } from '@/utils/jsonExport'

const emit = defineEmits<{
  (e: 'start', fileData?: DPIASnapshot): void
}>()

const uploadedFile = ref<File | null>(null)
const fileUploadError = ref<string | null>(null)
const isProcessing = ref(false)

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  console.log(target)
  if (target.files && target.files.length > 0) {
    uploadedFile.value = target.files[0]
    fileUploadError.value = null
  }
}

const startDpia = async () => {
  isProcessing.value = true
  fileUploadError.value = null

  try {
    if (uploadedFile.value) {
      console.log(uploadedFile.value)
      try {
        const fileData = await importFromJson(uploadedFile.value)
        // Start with loaded state
        emit('start', fileData)
      } catch (error) {
        if (error instanceof Error) {
          fileUploadError.value = error.message
        } else {
          fileUploadError.value = 'Fout bij het uploaden van het bestand'
        }
        isProcessing.value = false
      }
    } else {
      // Start with empty state
      emit('start')
    }
  } catch (error) {
    isProcessing.value = false
    if (error instanceof Error) {
      fileUploadError.value = error.message
    } else {
      fileUploadError.value = 'Er is een onbekende fout opgetreden'
    }
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <h1 class="utrecht-heading-1">Welkom bij de DPIA tool</h1>

  <div class="utrecht-form-fieldset rvo-form-fieldset">

    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">

      <legend class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend">
        Heeft u al een eerdere versie beschikbaar?
      </legend>

      <div class="utrecht-form-field-description" id="file-upload-helper">Upload de bestanden om
        bestaande gegevens te hergebruiken.</div>

      <div class="rvo-layout-margin-vertical--lg">
        <div role="group" aria-labelledby="file-upload-label"
          class="utrecht-form-field utrecht-form-field--text rvo-form-field">
          <div class="rvo-form-field__label">
            <label class="rvo-label" id="file-upload-label" for="file-upload-field">
              Bestand
            </label>
          </div>
          <input id="file-upload-field" type="file" class="rvo-file-input" accept=".json" @change="handleFileSelect" />
        </div>
      </div>
    </fieldset>

  </div>

  <div class="rvo-layout-margin-vertical--xl">
    <UiButton variant="primary" :icon="isProcessing ? 'refresh' : undefined"
      :label="isProcessing ? 'Bezig met laden...' : 'Beginnen met de DPIA'" :disabled="isProcessing"
      @click="startDpia" />
  </div>

  <p v-if="fileUploadError" class="rvo-alert rvo-alert--warning">
    {{ fileUploadError }}
  </p>
</template>

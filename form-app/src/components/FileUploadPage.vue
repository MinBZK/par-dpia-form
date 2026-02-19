<script setup lang="ts">
import { ref, computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { importFromJson } from '@/utils/jsonExport'
import { importFromPdf } from '@/utils/pdfImport'
import { useTaskStore } from '@/stores/tasks'

const emit = defineEmits<{
  (e: 'start', fileData?: DPIASnapshot): void
}>()

const uploadedFile = ref<File | null>(null)
const fileUploadError = ref<string | null>(null)
const isProcessing = ref(false)
const taskStore = useTaskStore()

const introText = computed(() => {
  if (taskStore.activeNamespace === 'dpia') {
    return "Deze tool begeleidt je stap voor stap bij het uitvoeren van een DPIA. De rapportage voldoet aan de eisen uit de AVG en het model DPIA Rijksdienst, en is geschikt voor verwerking in het verwerkingsregister.";
  } else {
    return 'Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst die helpt bij het inschatten van risicos en geeft op basis daarvan advies over het uitvoeren van een assessment.';
  }
})

const uploadText = computed(() => {
  if (taskStore.activeNamespace === 'dpia') {
    return 'Heb je al eerder een pre-scan of DPIA ingevuld voor deze gegevensverwerking?.';
  } else {
    return 'Heb je al eerder een pre-scan ingevuld voor deze gegevensverwerking?';
  }
})

const fileInputRef = ref<HTMLInputElement | null>(null)

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    uploadedFile.value = target.files[0]
    fileUploadError.value = null
  }
}

const clearFile = () => {
  uploadedFile.value = null
  fileUploadError.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const startDpia = async () => {
  isProcessing.value = true
  fileUploadError.value = null

  try {
    if (uploadedFile.value) {
      try {
        const isPdf = uploadedFile.value.name.toLowerCase().endsWith('.pdf')
        const fileData = isPdf
          ? await importFromPdf(uploadedFile.value)
          : await importFromJson(uploadedFile.value)
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

const formTypeLabel = computed(() => {
  return taskStore.activeNamespace === 'dpia' ? 'DPIA' : 'pre-scan'
})
</script>

<template>
  <h1 class="utrecht-heading-1">Start de {{ formTypeLabel }}</h1>

  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
      <div class="utrecht-form-field-description" id="file-upload-helper" v-html="introText"></div>
      <div class="rvo-layout-margin-vertical--lg">
      </div>
    </fieldset>
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
      <div class="rvo-layout-margin-vertical--lg">
        <div role="group" aria-labelledby="file-upload-label"
          class="utrecht-form-field utrecht-form-field--text rvo-form-field">
          <div class="rvo-form-field__label">
            <label class="rvo-label" id="file-upload-label" for="file-upload-field">
              {{ uploadText }}
            </label>
          </div>
          <input id="file-upload-field" ref="fileInputRef" type="file" class="rvo-file-input" accept=".json,.pdf" @change="handleFileSelect" />
          <UiButton v-if="uploadedFile" variant="tertiary" label="Bestand verwijderen" icon="verwijderen" size="xs"
            @click="clearFile" />
        </div>
      </div>
    </fieldset>
  </div>

  <div class="rvo-layout-margin-vertical--xl">
    <UiButton variant="primary" :icon="isProcessing ? 'refresh' : undefined"
      :label="isProcessing ? 'Bezig met laden...' : `Beginnen met de ${formTypeLabel}`" :disabled="isProcessing"
      @click="startDpia" />
  </div>

  <p v-if="fileUploadError" class="rvo-alert rvo-alert--warning">
    {{ fileUploadError }}
  </p>
</template>

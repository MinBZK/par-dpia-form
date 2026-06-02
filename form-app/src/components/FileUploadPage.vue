<script setup lang="ts">
import { ref, computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import ExportPdfInfo from '@/components/ExportPdfInfo.vue'
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
  } else if (taskStore.activeNamespace === 'iama') {
    return 'Deze tool begeleidt je stap voor stap bij het uitvoeren van een IAMA. Het Impact Assessment Mensenrechten en Algoritmes helpt bij het beoordelen van de impact van algoritmes op mensenrechten en publieke waarden.';
  } else {
    return 'Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst die helpt bij het inschatten van risicos en geeft op basis daarvan advies over het uitvoeren van een assessment.';
  }
})

const uploadText = computed(() => {
  if (taskStore.activeNamespace === 'dpia') {
    return 'Heb je al eerder een pre-scan of DPIA ingevuld aan de hand van deze tool? Upload het PDF-bestand hier om verder te werken.';
  } else if (taskStore.activeNamespace === 'iama') {
    return 'Heb je al eerder een IAMA ingevuld aan de hand van deze tool? Upload het PDF-bestand hier om verder te werken.';
  } else {
    return 'Heb je al eerder een pre-scan ingevuld aan de hand van deze tool? Upload het PDF-bestand hier om verder te werken.';
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

        // DPIA and pre-scan DPIA accept each other's file (so a pre-scan can seed the DPIA
        // prefills, and vice versa); the IAMA only accepts its own file.
        const ns = taskStore.activeNamespace
        const fileNs = fileData.metadata.activeNamespace
        const dpiaFamily = ['dpia', 'prescan']
        const isAccepted =
          fileNs === ns || (dpiaFamily.includes(ns) && !!fileNs && dpiaFamily.includes(fileNs))
        if (!isAccepted) {
          throw new Error(`Dit bestand bevat geen ${acceptedFilesLabel.value}gegevens.`)
        }

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
  if (taskStore.activeNamespace === 'dpia') return 'DPIA'
  if (taskStore.activeNamespace === 'iama') return 'IAMA'
  return 'pre-scan'
})

// Which file types this form accepts (DPIA and pre-scan accept each other's file).
const acceptedFilesLabel = computed(() => {
  if (taskStore.activeNamespace === 'dpia') return 'DPIA- of pre-scan-'
  if (taskStore.activeNamespace === 'iama') return 'IAMA-'
  return 'pre-scan- of DPIA-'
})

const formTypeArticle = computed(() => {
  if (taskStore.activeNamespace === 'iama') return 'het'
  return 'de'
})
</script>

<template>
  <h1 class="utrecht-heading-1">Start {{ formTypeArticle }} {{ formTypeLabel }}</h1>

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
          <div class="rvo-layout-margin-vertical--md">
            <ExportPdfInfo />
          </div>

        </div>
      </div>
    </fieldset>
  </div>

  <div class="rvo-layout-margin-vertical--xl">
    <UiButton variant="primary" :icon="isProcessing ? 'refresh' : undefined"
      :label="isProcessing ? 'Bezig met laden...' : `Beginnen met ${formTypeArticle} ${formTypeLabel}`" :disabled="isProcessing"
      @click="startDpia" />
  </div>

  <p v-if="fileUploadError" class="rvo-alert rvo-alert--warning">
    {{ fileUploadError }}
  </p>
</template>

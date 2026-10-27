<script setup lang="ts">
import { ref, computed } from 'vue'
import UiButton from './ui/UiButton.vue'
import ExportPdfInfo from './ExportPdfInfo.vue'
import { type AssessmentState } from '../models/assessmentState'
import { importFromJson } from '../utils/jsonExport'
import { importFromPdf } from '../utils/pdfImport'
import { assertImportMatchesNamespace } from '../utils/importDetect'
import { useTaskStore } from '../stores/tasks'
import { FormType } from '../models/dpia'

const emit = defineEmits<{
  (e: 'start', fileData?: AssessmentState): void
}>()

const uploadedFile = ref<File | null>(null)
const fileUploadError = ref<string | null>(null)
const isProcessing = ref(false)
const taskStore = useTaskStore()

const introText = computed(() => {
  if (taskStore.activeNamespace === FormType.DPIA) {
    return "Deze tool begeleidt je stap voor stap bij het uitvoeren van een DPIA. De rapportage voldoet aan de eisen uit de AVG en het model DPIA Rijksdienst, en is geschikt voor verwerking in het verwerkingsregister.";
  } else if (taskStore.activeNamespace === FormType.IAMA) {
    return 'Deze tool begeleidt jouw projectteam stap voor stap bij het uitvoeren van een IAMA. Het Impact Assessment Mensenrechten en Algoritmes helpt bij het beoordelen van de impact van algoritmes op mensenrechten en publieke waarden.<br /><br /> <div class="rvo-alert rvo-alert--info content-alert--flex"><span class="utrecht-icon rvo-icon rvo-icon-info rvo-icon--xl rvo-status-icon-info" role="img" aria-label="Informatie"></span><div class="rvo-alert-text">Het IAMA is een groepsproces en is niet bedoeld om individueel te doorlopen. Een gezamenlijke uitvoering zorgt voor betere en zorgvuldigere besluitvorming en een bredere borging. Informatie over groepssamenstelling en andere praktische tips zijn te vinden in de Inleiding en het <a href="https://www.rijksoverheid.nl/documenten/2026/02/16/toelichtingsdocument-impact-assessment-mensenrechten-en-algoritmes" target="_blank" rel="noopener noreferrer">IAMA-toelichtingsdocument</a>.</div></div>';
  } else {
    return 'Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst die helpt bij het inschatten van risicos en geeft op basis daarvan advies over het uitvoeren van een assessment.';
  }
})

const uploadText = computed(() => {
  if (taskStore.activeNamespace === FormType.DPIA) {
    return 'Heb je al eerder een pre-scan of DPIA ingevuld voor deze gegevensverwerking? Upload het PDF- of JSON-bestand hier om verder te werken.';
  } else if (taskStore.activeNamespace === FormType.IAMA) {
    return 'Heb je al eerder een IAMA ingevuld? Upload het PDF- of JSON-bestand hier om verder te werken.';
  } else {
    return 'Heb je al eerder een pre-scan ingevuld voor deze gegevensverwerking? Upload het PDF- of JSON-bestand hier om verder te werken.';
  }
})

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
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
      try {
        const file = uploadedFile.value
        const isPdf = file.name.toLowerCase().endsWith('.pdf')
        const fileData = isPdf ? await importFromPdf(file) : await importFromJson(file)
        assertImportMatchesNamespace(fileData, taskStore.activeNamespace)
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
  if (taskStore.activeNamespace === FormType.DPIA) return 'DPIA'
  if (taskStore.activeNamespace === FormType.IAMA) return 'IAMA'
  return 'pre-scan'
})

const formTypeArticle = computed(() => {
  return taskStore.activeNamespace === FormType.IAMA ? 'het' : 'de'
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
          <input id="file-upload-field" type="file" class="rvo-file-input" accept=".json,.pdf"
            @change="handleFileSelect" />
          <div class="rvo-layout-margin-vertical--md">
            <ExportPdfInfo />
          </div>
        </div>
      </div>
    </fieldset>
  </div>

  <div class="rvo-layout-margin-vertical--xl">
    <UiButton variant="primary" :icon="isProcessing ? 'refresh' : undefined"
      :label="isProcessing ? 'Bezig met laden...' : `Beginnen met ${formTypeArticle} ${formTypeLabel}`"
      :disabled="isProcessing" @click="startDpia" />
  </div>

  <p v-if="fileUploadError" class="rvo-alert rvo-alert--warning">
    {{ fileUploadError }}
  </p>
</template>

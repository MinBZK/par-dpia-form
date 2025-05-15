<script setup lang="ts">
import { ref, computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { importFromJson } from '@/utils/jsonExport'
import { useTaskStore } from '@/stores/tasks'

const emit = defineEmits<{
  (e: 'start', fileData?: DPIASnapshot): void
}>()

const uploadedFile = ref<File | null>(null)
const fileUploadError = ref<string | null>(null)
const isProcessing = ref(false)
const taskStore = useTaskStore()

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
      try {
        const fileData = await importFromJson(uploadedFile.value, taskStore.activeNamespace)
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
  return taskStore.activeNamespace === 'dpia' ? 'DPIA' : 'Pre-scan DPIA'
})
</script>

<template>
  <h1 class="utrecht-heading-1">Welkom</h1>

  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">

      <h2 class="utrecht-heading-2">Start met {{ formTypeLabel }}</h2>

      <p class="utrecht-paragraph rvo-margin-block-end--xl">
        Met de pre-scan toets je of een DPIA, DTIA, IAMA of KIA nodig is. De tool bevat een vragenlijst die helpt bij het inschatten van risico's en geeft op basis daarvan advies over het uitvoeren van een assessment.
      </p>

      <p class="utrecht-paragraph"><b>Heeft u al een eerdere versie van de DPIA of een pre-scan beschikbaar?</b><br>Upload hieronder een eerder opgeslagen bestand om deze informatie te laden.</p>
      <div class="rvo-layout-margin-vertical--lg">
        <div role="group" aria-labelledby="file-upload-label"
          class="utrecht-form-field utrecht-form-field--text rvo-form-field">
          <input id="file-upload-field" type="file" class="rvo-file-input" accept=".json" @change="handleFileSelect" />
        </div>
      </div>
    </fieldset>
  </div>

  <div class="rvo-layout-margin-vertical--xl">
    <UiButton variant="primary" :icon="isProcessing ? 'refresh' : undefined"
      :label="isProcessing ? 'Bezig met laden...' : `Beginnen`" :disabled="isProcessing"
      @click="startDpia" />
  </div>

  <p v-if="fileUploadError" class="rvo-alert rvo-alert--warning">
    {{ fileUploadError }}
  </p>
</template>

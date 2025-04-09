<script setup lang="ts">
import dpia_json from '@/assets/DPIA.json'
import Banner from '@/components/AppBanner.vue'
import ProgressTracker from '@/components/ProgressTracker.vue'
import SaveForm from '@/components/SaveForm.vue'
import TaskSection from '@/components/task/TaskSection.vue'
import UiButton from '@/components/ui/UiButton.vue'
import WelcomePage from '@/components/WelcomePage.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { useAppStatePersistence } from '@/composables/useAppStatePersistence'
import { DPIA } from '@/models/dpia.ts'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'
import { downloadJsonFile, exportDpiaToPdf } from '@/utils/fileExport'
import { createSigningTask } from '@/utils/taskUtils'
import { validateData } from '@/utils/validation'
import * as t from 'io-ts'
import { computed, onMounted, ref, watch } from 'vue'

// State
const error = ref<string | null>(null)
const isLoading = ref(true)
const isSaveModalOpen = ref(false)
const isExportingPdf = ref(false)
const dpiaStarted = ref(false)

// Store setup
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const rootTasks = computed(() => taskStore.getRootTasks)

const { syncInstances } = useTaskDependencies()
const appPersistence = useAppStatePersistence()

// Initialize tasks on component mount
onMounted(async () => {
  try {

    // Step 1: Initialize tasks from DPIA.json.
    const dpiaFormValidation: t.Validation<t.TypeOf<typeof DPIA>> = DPIA.decode(dpia_json)

    validateData<t.TypeOf<typeof DPIA>>(dpiaFormValidation, (validData) => {

      // Add signing task (export to PDF step).
      validData.tasks.push(createSigningTask(validData.tasks.length.toString()))

      // Step 2: Load saved state from local storage if it exists.
      const savedState = appPersistence.loadAppState()

      // Step 3: Initialize task structure.
      taskStore.init(validData.tasks)

      // Step 4: Apply saved state if it is available.
      if (savedState) {
        appPersistence.applyAppState(savedState)
      }

      // Step 5: Set up watchers for automatic saving to local storage.
      appPersistence.setupWatchers()

      // Step 6: Sync task instances based on their dependencies.
      syncInstances.value()
    })
  } catch (e: unknown) {
    if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = 'An unknown error occurred'
    }
  } finally {
    isLoading.value = false
  }
})

// Sync instances whenever answers change
watch(
  () => answerStore.answers,
  () => {
    // Sync instances whenever answers change
    syncInstances.value()
  },
  { deep: true },
)

const { currentRootTaskId, goToNext, goToPrevious, isFirstTask, isLastTask } = useTaskNavigation()

const openSaveModal = () => {
  isSaveModalOpen.value = true
}
const closeSaveModal = () => {
  isSaveModalOpen.value = false
}
const handleSaveForm = (filename: string) => {
  console.log('Saving form with filename:', filename)
  try {
    const snapshotData: DPIASnapshot = {
      metadata: {
        savedAt: new Date().toISOString(),
      },
      taskState: {
        currentRootTaskId: taskStore.currentRootTaskId,
        taskInstances: taskStore.taskInstances,
        completedRootTaskIds: Array.from(taskStore.completedRootTaskIds),
      },
      answers: answerStore.answers,
    }

    downloadJsonFile(snapshotData, filename)
  } catch (error) {
    //TODO: Make user friendly error
    console.error('Failed to save form data:', error)
  }
}

const handleExportPdf = async () => {
  await exportDpiaToPdf()
}

const handleStart = (fileData?: DPIASnapshot) => {
  if (fileData) {
    appPersistence.applyAppState(fileData)
    syncInstances.value()
  }
  dpiaStarted.value = true
}
</script>

<template>
  <Banner />
  <div v-if="isLoading">
    <p>Ophalen van DPIA taken ...</p>
  </div>

  <!-- Show decoding error if decoding has failed. -->
  <div v-else-if="error" role="alert" aria-live="assertive">
    <h2 class="utrecht-heading-2">Foutmelding</h2>
    <p>Er is iets mis gegaan bij het inlezen van de vragen.</p>
    <pre>{{ error }}</pre>
  </div>

  <!-- If all is well, render the tasks. -->
  <div v-else class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg">
    <!-- Show all main (root) tasks -->
    <nav class="rvo-sidebar-layout__sidebar" aria-label="Stappen navigatie">
      <ProgressTracker :rootTasks="rootTasks" :disabled="!dpiaStarted" />
    </nav>

    <div class="rvo-sidebar-layout__content" role="form" aria-labelledby="current-section-heading">
      <!-- Render curren task -->
      <div v-if="!dpiaStarted">
        <WelcomePage @start="handleStart" />
      </div>

      <template v-else>
        <TaskSection :taskId="currentRootTaskId" />

        <div class="rvo-layout-margin-vertical--xl">
          <!-- Navigation buttons -->
          <div class="button-group-container">
            <UiButton v-if="!isFirstTask" variant="tertiary" icon="terug" label="Vorige stap" @click="goToPrevious" />
            <p class="utrecht-button-group" role="group" aria-label="Formulier navigatie">
              <UiButton variant="secondary" label="Opslaan" @click="openSaveModal" />
              <UiButton v-if="!isLastTask" variant="primary" label="Volgende stap" @click="goToNext" />
              <UiButton v-if="isLastTask" variant="primary" label="Exporteer als PDF" @click="handleExportPdf" />
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Save Form Modal -->
  <SaveForm :is-open="isSaveModalOpen" @close="closeSaveModal" @save="handleSaveForm" />
</template>

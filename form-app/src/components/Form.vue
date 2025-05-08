<script setup lang="ts">
import Banner from '@/components/AppBanner.vue'
import ProgressTracker from '@/components/ProgressTracker.vue'
import SaveForm from '@/components/SaveForm.vue'
import TaskSection from '@/components/task/TaskSection.vue'
import UiButton from '@/components/ui/UiButton.vue'
import NavHeader from '@/components/NavHeader.vue'
import FileUploadPage from '@/components/FileUploadPage.vue'
import LiveResults from '@/components/LiveResults.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { useAppStatePersistence } from '@/composables/useAppStatePersistence'
import { DPIA, FormType } from '@/models/dpia.ts'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type NavigationFunctions } from '@/models/navigation'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, taskIsOfTaskType } from '@/stores/tasks'
import { exportToJson } from '@/utils/jsonExport'
import { exportToPdf } from '@/utils/pdfExport'
import * as t from 'io-ts'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  navigation: NavigationFunctions
  namespace: FormType
  validData: t.TypeOf<typeof DPIA> | null
}>()

// State
const error = ref<string | null>(null)
const isLoading = ref(true)
const isSaveModalOpen = ref(false)
const formStarted = ref(false)

// Store setup
const taskStore = useTaskStore()
const answerStore = useAnswerStore()

const { syncInstances } = useTaskDependencies()
const appPersistence = useAppStatePersistence()

// Initialize tasks on component mount
onMounted(async () => {
  try {
    taskStore.setActiveNamespace(props.namespace)
    answerStore.setActiveNamespace(props.namespace)

    // Step 1: Initialize tasks from DPIA.json.
    if (!props.validData) {
      error.value = `No valid schema data available for ${props.namespace}`
      isLoading.value = false
      return
    }

    // Step 2: Load saved state from local storage if it exists.
    const savedState = appPersistence.loadAppState()

    // Step 3: Initialize task structure.
    taskStore.init(props.validData.tasks)

    // Step 4: Apply saved state if it is available.
    if (savedState) {
      appPersistence.applyAppState(savedState)
    }

    // Step 5: Set up watchers for automatic saving to local storage.
    appPersistence.setupWatchers()

    // Step 6: Sync task instances based on their dependencies.
    syncInstances.value()

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

onBeforeUnmount(() => {
  formStarted.value = false
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
const handleSaveForm = async (filename: string) => {
  console.log('Saving form with filename:', filename)
  try {
    // This will now export only the active namespace data
    await exportToJson(taskStore, answerStore, filename)
  } catch (error) {
    //TODO: Make user friendly error
    console.error('Failed to save form data:', error)
  }
}

const handleExportPdf = async () => {
  try {
    await exportToPdf(taskStore, answerStore)
  } catch (error) {
    console.error('Failed to export PDF:', error)
  }
}

const handleStart = (fileData?: DPIASnapshot) => {
  if (fileData) {
    appPersistence.applyAppState(fileData)
    syncInstances.value()
  }
  formStarted.value = true
}

const handleReset = () => {
  // 1. Clear local storage
  appPersistence.clearSavedState(taskStore.activeNamespace)

  // 2. Reset answer store
  answerStore.answers[taskStore.activeNamespace] = {}

  // 3. Reset task store state
  taskStore.taskInstances[taskStore.activeNamespace] = {}
  taskStore.completedRootTaskIds[taskStore.activeNamespace] = new Set()
  taskStore.currentRootTaskId[taskStore.activeNamespace] = taskStore.rootTaskIds[taskStore.activeNamespace][0] || "0"

  // 4. Force re-initialization
  taskStore.isInitialized[taskStore.activeNamespace] = false
  if (props.validData) {
    taskStore.init(props.validData.tasks, true)
  }

  // 5. Reset UI state
  formStarted.value = false
}

const isSigningTask = computed(() => {
  const task = taskStore.taskById(currentRootTaskId.value)
  return taskIsOfTaskType(task, 'signing')
})
</script>

<template>
  <Banner />
  <div v-if="isLoading">
    <p>Ophalen van taken ...</p>
  </div>

  <!-- Show decoding error if decoding has failed. -->
  <div v-else-if="error" role="alert" aria-live="assertive">
    <h2 class="utrecht-heading-2">Foutmelding</h2>
    <p>Er is iets mis gegaan bij het inlezen van de vragen.</p>
    <pre>{{ error }}</pre>
  </div>

  <!-- If all is well, render the tasks. -->
  <template v-else>
    <NavHeader :navigation="navigation" />

    <div class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg">
      <nav class="rvo-sidebar-layout__sidebar" aria-label="Stappen navigatie">
        <ProgressTracker :disabled="!formStarted" :navigable="namespace === FormType.DPIA || namespace ===
          FormType.PRE_SCAN" />

      </nav>

      <div class="rvo-sidebar-layout__content" role="form" aria-labelledby="current-section-heading">
        <div v-if="formStarted" class="utrecht-button-group rvo-action-groul--position-right" role="group"
          aria-label="Formulier opslag">
          <UiButton variant="tertiary" :label="`Begin nieuwe ${taskStore.activeNamespace ===
            FormType.DPIA ? 'DPIA' : 'Pre-scan DPIA'}`" icon="refresh" @click="handleReset" />
          <UiButton variant="tertiary" label="Opslaan als bestand" icon="document-blanco" @click="openSaveModal" />
        </div>
        <FileUploadPage v-if="!formStarted" @start="handleStart" />

        <template v-else>
          <TaskSection :taskId="currentRootTaskId" />

          <div class="rvo-layout-margin-vertical--xl rvo-margin-block-start--3xl">
            <!-- Navigation buttons -->
            <div class="button-group-container">
              <UiButton v-if="!isFirstTask" variant="tertiary" icon="terug" label="Vorige stap" @click="goToPrevious" />
              <div class="utrecht-button-group" role="group" aria-label="Formulier navigatie">
                <div v-if="!isLastTask" class="rvo-checkbox__group">
                  <label class="rvo-checkbox rvo-checkbox--not-checked" for="`${currentRootTaskId}-completed`">
                    <input id="`${currentRootTaskId}-completed`" name="step_completed" class="rvo-checkbox__input"
                      type="checkbox" :checked="taskStore.isRootTaskCompleted(currentRootTaskId)"
                      @change="taskStore.toggleCompleteForTaskId(currentRootTaskId)" />
                    Markeer als voltooid
                  </label>
                </div>
                <UiButton v-if="!isLastTask" variant="primary" icon="pijl-naar-rechts" :showIconAfter="true"
                  label="Volgende stap" @click="goToNext" />
                <UiButton v-if="isLastTask" variant="primary" label="Exporteer als PDF" @click="handleExportPdf" />
              </div>
            </div>
          </div>
        </template>

        <div v-if="formStarted && namespace === FormType.PRE_SCAN && !isSigningTask"
          class="rvo-layout-margin-vertical--xl">
          <LiveResults />
        </div>
      </div>
    </div>
  </template>

  <!-- Save Form Modal -->
  <SaveForm :is-open="isSaveModalOpen" @close="closeSaveModal" @save="handleSaveForm" />
</template>

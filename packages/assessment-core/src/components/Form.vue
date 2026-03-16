<script setup lang="ts">
import Banner from './AppBanner.vue'
import ProgressTracker from './ProgressTracker.vue'
import SaveForm from './SaveForm.vue'
import TaskSection from './task/TaskSection.vue'
import UiButton from './ui/UiButton.vue'
import NavHeader from './NavHeader.vue'
import FileUploadPage from './FileUploadPage.vue'
import LiveResults from './LiveResults.vue'
import { useTaskDependencies } from '../composables/useTaskDependencies'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { DPIA, FormType } from '../models/dpia'
import { type AssessmentState } from '../models/assessmentState'
import { type NavigationFunctions } from '../models/navigation'
import { useAnswerStore } from '../stores/answers'
import { useTaskStore, taskIsOfTaskType } from '../stores/tasks'
import { useCalculationStore } from '../stores/calculations'
import { exportToJson } from '../utils/jsonExport'
import { PERSISTENCE_KEY, EXPORT_KEY } from '../persistence'
import * as t from 'io-ts'
import { computed, inject, onMounted, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  navigation: NavigationFunctions
  namespace: FormType
  validData: t.TypeOf<typeof DPIA> | null
  showBanner?: boolean
  showNavHeader?: boolean
  showFileActions?: boolean
  autoStart?: boolean
}>(), {
  showBanner: true,
  showNavHeader: true,
  showFileActions: true,
  autoStart: false,
})

// State
const error = ref<string | null>(null)
const isLoading = ref(true)
const isSaveModalOpen = ref(false)
const formStarted = ref(false)

// Store setup
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const calculationStore = useCalculationStore()

const { syncInstances } = useTaskDependencies()

// Inject persistence and export providers
const persistence = inject(PERSISTENCE_KEY)!
const exportProvider = inject(EXPORT_KEY, null)

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

    // Step 2: Load saved state from persistence provider.
    const savedState = await persistence.loadAppState(props.namespace)

    // Step 3: Initialize task structure.
    taskStore.init(props.validData.tasks)

    // Step 4: Apply saved state if it is available.
    if (savedState) {
      persistence.applyAppState(savedState)
    }

    // Auto-start: skip FileUploadPage (used by boekhouding where data comes from API)
    if (props.autoStart) {
      formStarted.value = true
    }

    // Step 5: Set up watchers for automatic saving.
    const teardown = persistence.setupWatchers()
    if (teardown) onBeforeUnmount(teardown)

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
  if (persistence.flushSave) persistence.flushSave()
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

const { currentRootTaskId, goToNext: rawGoToNext, goToPrevious: rawGoToPrevious, isFirstTask, isLastTask } = useTaskNavigation()

const flushBeforeNavigate = () => {
  if (persistence.flushSave) persistence.flushSave()
}

const goToNext = () => {
  flushBeforeNavigate()
  rawGoToNext()
}

const goToPrevious = () => {
  flushBeforeNavigate()
  rawGoToPrevious()
}

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
    if (exportProvider?.exportToPdf) {
      await exportProvider.exportToPdf()
    } else {
      console.warn('No PDF export provider available')
    }
  } catch (error) {
    console.error('Failed to export PDF:', error)
  }
}

const handleStart = (fileData?: AssessmentState) => {
  if (fileData) {
    // Apply state for all namespaces
    persistence.applyAppState(fileData)

    // Check if the file contains data for the active namespace
    const hasDataForActiveNamespace = fileData.taskState &&
      fileData.taskState[props.namespace] &&
      fileData.answers &&
      fileData.answers[props.namespace];

    // Synchronize task instances based on the data
    if (hasDataForActiveNamespace) {
      syncInstances.value()
    }
  }
  // Start the form regardless
  formStarted.value = true
}

const handleReset = () => {
  // 1. Clear persistence
  persistence.clearSavedState(taskStore.activeNamespace)

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
  <Banner v-if="showBanner" />
  <div v-if="isLoading" class="rvo-max-width-layout rvo-max-width-layout--lg rvo-max-width-layout-inline-padding--md">
    <p>Ophalen van taken...</p>
  </div>

  <!-- Show decoding error if decoding has failed. -->
  <div v-else-if="error" role="alert" aria-live="assertive">
    <h2 class="utrecht-heading-2">Foutmelding</h2>
    <p>Er is iets mis gegaan bij het inlezen van de vragen.</p>
    <pre>{{ error }}</pre>
  </div>

  <!-- If all is well, render the tasks. -->
  <template v-else>
    <NavHeader v-if="showNavHeader" :navigation="navigation" />

    <div class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg">
      <nav class="rvo-sidebar-layout__sidebar" aria-label="Stappen navigatie">
        <ProgressTracker :disabled="!formStarted" :navigable="namespace === FormType.DPIA || namespace ===
          FormType.PRE_SCAN" />

      </nav>

      <div class="rvo-sidebar-layout__content" role="form" aria-labelledby="current-section-heading">
        <div v-if="formStarted && showFileActions" class="utrecht-button-group rvo-action-groul--position-right" role="group"
          aria-label="Formulier opslag">
          <UiButton variant="tertiary" :label="`Begin nieuwe ${taskStore.activeNamespace ===
            FormType.DPIA ? 'DPIA' : 'Pre-scan DPIA'}`" icon="refresh" size="xs" @click="handleReset" />
          <UiButton variant="tertiary" label="Opslaan als bestand" icon="document-blanco" size="xs"
            @click="openSaveModal" />
        </div>
        <FileUploadPage v-if="!formStarted" @start="handleStart" />

        <template v-else>
          <TaskSection :taskId="currentRootTaskId" />

          <div class="rvo-layout-margin-vertical--xl rvo-margin-block-start--xl">
            <!-- Navigation buttons -->
            <div class="button-group-container">
              <UiButton v-if="!isFirstTask" variant="secondary" icon="terug" label="Vorige stap" @click="goToPrevious" />
              <div class="utrecht-button-group" role="group" aria-label="Formulier navigatie">
                <div v-if="!isLastTask" class="rvo-checkbox__group">
                  <label class="rvo-checkbox rvo-checkbox--not-checked" for="`${currentRootTaskId}-completed`">
                    <input id="`${currentRootTaskId}-completed`" name="step_completed" class="rvo-checkbox__input"
                      type="checkbox" :checked="taskStore.isRootTaskCompleted(currentRootTaskId)"
                      @change="taskStore.toggleCompleteForTaskId(currentRootTaskId); flushBeforeNavigate()" />
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

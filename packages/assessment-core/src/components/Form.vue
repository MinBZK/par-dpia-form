<script setup lang="ts">
import Banner from './AppBanner.vue'
import ProgressTracker from './ProgressTracker.vue'
import ExportPdfInfo from './ExportPdfInfo.vue'
import ExportMenu from './ExportMenu.vue'
import TaskSection from './task/TaskSection.vue'
import UiButton from './ui/UiButton.vue'
import NavHeader from './NavHeader.vue'
import FileUploadPage from './FileUploadPage.vue'
import LiveResults from './LiveResults.vue'
import { useTaskDependencies } from '../composables/useTaskDependencies'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { useConditionalHideReconcile } from '../composables/useConditionalHideReconcile'
import { DPIA, FormType } from '../models/dpia'
import type { AssessmentState } from '../models/assessmentState'
import type { NavigationFunctions } from '../models/navigation'
import { useAnswerStore } from '../stores/answers'
import { useTaskStore, taskIsOfTaskType } from '../stores/tasks'
import { useCalculationStore } from '../stores/calculations'
import { exportToJson } from '../utils/jsonExport'
import { exportToMarkdown } from '../utils/markdownExport'
import { exportToPdf } from '../utils/pdfExport'
import { rebuildRepeatableInstances } from '../utils/applyState'
import { PERSISTENCE_KEY } from '../persistence'
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
const formStarted = ref(false)

// Store setup
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const calculationStore = useCalculationStore()

const { syncInstances } = useTaskDependencies()

// Keep persisted state clean when conditional fields hide their dependents,
// with a short in-memory cache so flipping the parent back restores the data.
const hideReconcile = useConditionalHideReconcile()

// Inject persistence provider
const persistence = inject(PERSISTENCE_KEY)!

// Initialize tasks on component mount
onMounted(async () => {
  try {
    taskStore.setActiveNamespace(props.namespace)
    answerStore.setActiveNamespace(props.namespace)

    // Step 1: Initialize tasks from DPIA.json.
    if (!props.validData) {
      error.value = `Geen geldige schemadata beschikbaar voor ${props.namespace}`
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
      // Rebuild repeatable task instances from answer keys and grouped arrays
      rebuildRepeatableInstances(taskStore, answerStore, savedState.answers)
    }

    // Step 4b: Restore UI state (e.g. last viewed section) after task init,
    // because init resets currentRootTaskId to the first section.
    if (persistence.restoreUiState) {
      persistence.restoreUiState()
    }

    // Auto-start: skip FileUploadPage (used by boekhouding where data comes from API)
    if (props.autoStart) {
      formStarted.value = true
    }

    // Step 5: Sync task instances based on their dependencies.
    syncInstances.value()

    // Seed the observed-values map for conditional hide tracking AFTER init
    // so that initial load is not treated as a change.
    hideReconcile.seedFromStore()

    // Step 6: Snapshot baseline AFTER full initialization so that
    // initialization-related changes (syncInstances, etc.) are not
    // treated as user changes in the diff.
    if (persistence.snapshotBaseline) {
      persistence.snapshotBaseline()
    }

    // Step 7: Set up watchers for automatic saving (after snapshot).
    const teardown = persistence.setupWatchers()
    if (teardown) onBeforeUnmount(teardown)

  } catch (e: unknown) {
    if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = 'Er is een onbekende fout opgetreden'
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
  () => syncInstances.value(),
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

const handleExport = async (format: 'pdf' | 'json' | 'markdown') => {
  try {
    if (format === 'pdf') {
      await exportToPdf(taskStore, answerStore, calculationStore)
    } else if (format === 'json') {
      exportToJson(taskStore, answerStore)
    } else {
      await exportToMarkdown(taskStore, answerStore)
    }
  } catch (error) {
    console.error(`Failed to export ${format}:`, error)
  }
}

const handleStart = (fileData?: AssessmentState) => {
  if (fileData) {
    // Apply state for all namespaces
    persistence.applyAppState(fileData)

    // Rebuild repeatable instances from answer keys/grouped arrays and sync dependencies
    rebuildRepeatableInstances(taskStore, answerStore, fileData.answers)
    syncInstances.value()
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

const isInformationalStep = computed(() => {
  const task = taskStore.taskById(currentRootTaskId.value)
  return taskIsOfTaskType(task, 'informational')
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
    <NavHeader v-if="showNavHeader" :navigation="navigation">
      <template v-if="formStarted && showFileActions">
        <UiButton variant="tertiary" :label="`Begin nieuwe ${taskStore.activeNamespace ===
          FormType.DPIA ? 'DPIA' : taskStore.activeNamespace === FormType.IAMA ? 'IAMA' : 'Pre-scan'}`" icon="refresh" size="xs" @click="handleReset" />
        <ExportMenu @export="handleExport" />
      </template>
    </NavHeader>

    <div class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg"
      :class="{ 'rvo-max-width-layout-inline-padding--md': showNavHeader }">
      <nav class="rvo-sidebar-layout__sidebar" aria-label="Stappen navigatie">
        <ProgressTracker :disabled="!formStarted" :navigable="namespace === FormType.DPIA || namespace ===
          FormType.PRE_SCAN || namespace === FormType.IAMA" />

      </nav>

      <div class="rvo-sidebar-layout__content" role="form" aria-labelledby="current-section-heading">
        <FileUploadPage v-if="!formStarted" @start="handleStart" />

        <template v-else>
          <TaskSection :taskId="currentRootTaskId" />

          <div class="rvo-layout-margin-vertical--xl rvo-margin-block-start--xl">
            <!-- Navigation buttons -->
            <div class="button-group-container" role="group" aria-label="Formulier navigatie">
              <UiButton v-if="!isFirstTask" variant="secondary" icon="terug" label="Vorige stap" @click="goToPrevious" />
              <div v-if="!isLastTask && !isInformationalStep" class="button-group-container__completed">
                <label class="rvo-checkbox rvo-checkbox--not-checked" :for="`${currentRootTaskId}-completed`">
                  <input :id="`${currentRootTaskId}-completed`" name="step_completed" class="rvo-checkbox__input"
                    type="checkbox" :checked="taskStore.isRootTaskCompleted(currentRootTaskId)"
                    @change="taskStore.toggleCompleteForTaskId(currentRootTaskId); flushBeforeNavigate()" />
                  Markeer als voltooid
                </label>
              </div>
              <div class="button-group-container__end">
                <div v-if="!isLastTask">
                  <UiButton variant="primary" icon="pijl-naar-rechts" :showIconAfter="true"
                    label="Volgende stap" @click="goToNext" />
                </div>
                <ExportMenu v-if="isLastTask" split @export="handleExport" />
              </div>
            </div>
            <div v-if="isLastTask" class="rvo-layout-margin-vertical--xl">
              <ExportPdfInfo />
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
</template>

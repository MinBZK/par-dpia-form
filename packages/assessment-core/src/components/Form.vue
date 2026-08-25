<script setup lang="ts">
import Banner from './AppBanner.vue'
import ProgressTracker from './ProgressTracker.vue'
import ExportPdfInfo from './ExportPdfInfo.vue'
import ExportMenu from './ExportMenu.vue'
import TaskSection from './task/TaskSection.vue'
import FileUploadPage from './FileUploadPage.vue'
import LiveResults from './LiveResults.vue'
import { useTaskDependencies } from '../composables/useTaskDependencies'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { useConditionalHideReconcile } from '../composables/useConditionalHideReconcile'
import { useDefinitionTooltips } from '../composables/useDefinitionTooltips'
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
import { CONTENT_READONLY_KEY } from '../injectionKeys'
import * as t from 'io-ts'
import { computed, inject, onMounted, onBeforeUnmount, provide, ref, toRef, watch } from 'vue'
import '@nldd/design-system/button'
import '@nldd/design-system/menu-bar'
import '@nldd/design-system/menu-bar-item'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/sidebar-section'
import '@nldd/design-system/inline-dialog'
import '@nldd/design-system/spacer'

const props = withDefaults(defineProps<{
  navigation: NavigationFunctions
  namespace: FormType
  validData: t.TypeOf<typeof DPIA> | null
  showBanner?: boolean
  showNavHeader?: boolean
  showFileActions?: boolean
  autoStart?: boolean
  bannerTitle?: string
  commentedRootTaskIds?: string[]
  // Read-only role: the questions accept no input, the rest of the page does.
  contentInert?: boolean
}>(), {
  contentInert: false,
  showBanner: true,
  showNavHeader: true,
  showFileActions: true,
  autoStart: false,
  bannerTitle: '',
  commentedRootTaskIds: () => [],
})

// Keeps a term explanation inside the viewport, whatever the term's position.
useDefinitionTooltips()

// Inert on the whole question block would take the term tooltips with it:
// an inert subtree is not hit-tested, so :hover never fires. The flag travels
// down to the individual inputs instead.
provide(CONTENT_READONLY_KEY, toRef(props, 'contentInert'))

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

const resetOpen = ref(false)

const resetLabel = computed(() =>
  taskStore.activeNamespace === FormType.DPIA ? 'DPIA'
  : taskStore.activeNamespace === FormType.IAMA ? 'IAMA'
  : 'Pre-scan')

// Counted from the store rather than storage: this is what the user is about to
// lose, phrased in the thing they recognise.
const filledAnswerCount = computed(() =>
  Object.keys(answerStore.answers[taskStore.activeNamespace]).length)

const handleReset = () => {
  resetOpen.value = false
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

// nldd-modal-dialog exposes show()/hide(); they only exist once the custom
// element is upgraded (not in jsdom unit tests), hence the optional calls.
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }

const resetDialog = ref<ModalDialogElement | null>(null)

const resetSupportingText = computed(() => {
  const lost = filledAnswerCount.value > 0
    ? `Je ${resetLabel.value} met ${filledAnswerCount.value} ingevuld${filledAnswerCount.value === 1 ? '' : 'e'} antwoord${filledAnswerCount.value === 1 ? '' : 'en'} wordt definitief gewist.`
    : `De opgeslagen ${resetLabel.value} wordt definitief gewist.`
  return `${lost} Dit kan niet ongedaan worden gemaakt. Exporteer eerst als je de antwoorden wilt bewaren.`
})

watch(resetOpen, (open) => {
  if (open) resetDialog.value?.show?.()
  else resetDialog.value?.hide?.()
})

// The modal closes itself on Esc; route that back through the state so the
// watch performs the single hide() instead of a hide loop.
const onResetClose = () => {
  resetOpen.value = false
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
  <!-- The document actions live in the utility menu bar of the top navigation,
       so the page below carries content only. -->
  <Banner v-if="showBanner" :title="bannerTitle"
    back-text="Overzicht" @back="navigation.goToLanding">
    <template v-if="showNavHeader && formStarted && showFileActions" #utility>
      <nldd-menu-bar slot="utility" accessible-label="Acties voor dit formulier">
        <nldd-menu-bar-item icon="arrow-clockwise" :text="`Begin nieuwe ${resetLabel}`"
          @select="resetOpen = true"></nldd-menu-bar-item>
        <ExportMenu menu-bar @export="handleExport" />
      </nldd-menu-bar>
    </template>
  </Banner>
  <nldd-inline-dialog v-if="isLoading" variant="loading" text="Ophalen van taken..."></nldd-inline-dialog>

  <!-- Show decoding error if decoding has failed. -->
  <div v-else-if="error" role="alert" aria-live="assertive">
    <h2>Foutmelding</h2>
    <p>Er is iets mis gegaan bij het inlezen van de vragen.</p>
    <pre>{{ error }}</pre>
  </div>

  <!-- If all is well, render the tasks. The sidebar section collapses the
       table of contents into a sheet on narrow screens. -->
  <template v-else>
    <!-- Both sticky insets far off-screen: nldd-sidebar-section pins its
         sidebar and caps it at the viewport height, which hides the tail of a
         long table of contents behind a scroll area of its own. The component
         has no attribute to opt out of sticky, so the insets are the only way
         in through its public API; with these the panel simply scrolls along
         with the page. -->
    <nldd-sidebar-section sidebar-label="Stappen navigatie" padding-top="24"
      sticky-top="-200dvh" sticky-bottom="-200dvh">
      <!-- Page header inside the section, so a consumer's title bar lines up
           with the two columns instead of with its own container. -->
      <div v-if="$slots.header" slot="header">
        <slot name="header" />
      </div>

      <nav slot="sidebar" aria-label="Stappen navigatie">
        <ProgressTracker :disabled="!formStarted" :navigable="namespace === FormType.DPIA || namespace ===
          FormType.PRE_SCAN || namespace === FormType.IAMA" :commentedTaskIds="props.commentedRootTaskIds" />
      </nav>

      <div class="form-content" role="form" aria-labelledby="current-section-heading">
        <FileUploadPage v-if="!formStarted" @start="handleStart" />

        <template v-else>
          <TaskSection :taskId="currentRootTaskId" />

          <nldd-spacer size="32"></nldd-spacer>
          <!-- Navigation buttons -->
          <!-- The checkbox is a control, not an action, so it sits on its own
               line above the two actions at every width. -->
          <nldd-container gap="16">
            <label v-if="!isLastTask && !isInformationalStep" class="form-field__choice"
              :for="`${currentRootTaskId}-completed`" :inert="contentInert || undefined">
              <input :id="`${currentRootTaskId}-completed`" name="step_completed"
                type="checkbox" :checked="taskStore.isRootTaskCompleted(currentRootTaskId)"
                @change="taskStore.toggleCompleteForTaskId(currentRootTaskId); flushBeforeNavigate()" />
              Markeer als voltooid
            </label>
            <div class="step-actions" role="group" aria-label="Formulier navigatie">
              <nldd-button v-if="!isFirstTask" variant="secondary" start-icon="arrow-left"
                text="Vorige stap" @click="goToPrevious"></nldd-button>
              <nldd-button v-if="!isLastTask" variant="primary" end-icon="arrow-right"
                text="Volgende stap" @click="goToNext"></nldd-button>
              <ExportMenu v-if="isLastTask" split @export="handleExport" />
            </div>
          </nldd-container>
          <template v-if="isLastTask">
            <nldd-spacer size="32"></nldd-spacer>
            <ExportPdfInfo />
          </template>
        </template>

        <template v-if="formStarted && namespace === FormType.PRE_SCAN && !isSigningTask">
          <nldd-spacer size="32"></nldd-spacer>
          <LiveResults />
        </template>
      </div>
    </nldd-sidebar-section>
  </template>

  <!-- "Begin nieuwe X" confirmation. The safe way out is the primary action,
       the destructive one the destructive variant (NLDD design guideline). -->
  <nldd-modal-dialog ref="resetDialog" variant="alert"
    :text="`Nieuwe ${resetLabel} beginnen?`" :supporting-text="resetSupportingText"
    @close="onResetClose">
    <nldd-button slot="actions" variant="primary" text="Annuleren"
      @click="resetOpen = false"></nldd-button>
    <nldd-button slot="actions" variant="destructive" :text="`Ja, begin nieuwe ${resetLabel}`"
      @click="handleReset"></nldd-button>
  </nldd-modal-dialog>
</template>

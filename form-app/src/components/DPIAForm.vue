<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import dpia_json from '@/assets/DPIA.json'
import UiButton from '@/components/ui/UiButton.vue'
import TaskSection from '@/components/task/TaskSection.vue'
import Banner from '@/components/AppBanner.vue'
import ProgressTracker from '@/components/ProgressTracker.vue'
import SaveForm from '@/components/SaveForm.vue'
import * as t from 'io-ts'
import { DPIA } from '@/models/dpia.ts'
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import { validateData } from '@/utils/validation'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { downloadJsonFile } from '@/utils/fileExport'
import { useTaskDependencies } from '@/composables/useTaskDependencies'



// State
const error = ref<string | null>(null)
const isLoading = ref(true)
const isSaveModalOpen = ref(false)

// Store setup
const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const rootTasks = computed(() => taskStore.getRootTasks)

const { syncInstances } = useTaskDependencies()

// Initialize tasks on component mount
onMounted(async () => {
  try {
    const dpiaFormValidation: t.Validation<t.TypeOf<typeof DPIA>> = DPIA.decode(dpia_json)
    validateData<t.TypeOf<typeof DPIA>>(dpiaFormValidation, (validData) => {
      taskStore.init(validData.tasks)
      taskStore.syncInstancesFromAnswers(answerStore.answers);
      syncInstances.value();
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

// Also add a watcher for answer changes
watch(() => answerStore.answers, () => {
  // Sync instances whenever answers change
  syncInstances.value();
}, { deep: true });

const {
  currentRootTaskId,
  goToNext,
  goToPrevious,
  isFirstTask,
  isLastTask
} = useTaskNavigation()

const openSaveModal = () => {
  isSaveModalOpen.value = true;
}
const closeSaveModal = () => {
  isSaveModalOpen.value = false;
}
const handleSaveForm = (filename: string) => {
  console.log('Saving form with filename:', filename);
  try {

    const snapshotData: DPIASnapshot = {
      metadata: {
        savedAt: new Date().toISOString(),
      },
      taskState: {
        currentRootTaskId: taskStore.currentRootTaskId,
        taskInstances: { ...taskStore.taskInstances }
      },
      answers: { ...answerStore.answers }
    }

    downloadJsonFile(snapshotData, filename)
  } catch (error) {

    //TODO: Make user friendly error
    console.error('Failed to save form data:', error)
  }
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
      <ProgressTracker :rootTasks="rootTasks" />
    </nav>

    <div class="rvo-sidebar-layout__content" role="form" aria-labelledby="current-section-heading">
      <!-- Render curren task -->
      <TaskSection :taskId="currentRootTaskId" />

      <div class="rvo-layout-margin-vertical--xl">

        <!-- Navigation buttons -->
        <div class="button-group-container">
          <UiButton v-if="!isFirstTask" variant="tertiary" icon="terug" label="Vorige stap" @click="goToPrevious" />
          <p class="utrecht-button-group" role="group" aria-label="Formulier navigatie">
            <UiButton variant="secondary" label="Opslaan" @click="openSaveModal" />
            <UiButton v-if="!isLastTask" variant="primary" label="Volgende stap" @click="goToNext" />
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Save Form Modal -->
  <SaveForm :is-open="isSaveModalOpen" @close="closeSaveModal" @save="handleSaveForm" />
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import dpia_json from '@/assets/DPIA.json'
import Button from '@/components/ui/Button.vue'
import TaskSection from '@/components/task/TaskSection.vue'
import Banner from '@/components/AppBanner.vue'
import ProgressTracker from '@/components/ProgressTracker.vue'
import * as t from 'io-ts'
import { DPIA } from '@/models/dpia.ts'
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { useTaskStore } from '@/stores/tasks'
import { validateData } from '@/utils/validation'

// State
const error = ref<string | null>(null)
const isLoading = ref(true)

// Store setup
const taskStore = useTaskStore()
const rootTasks = computed(() => taskStore.getRootTasks)

// Initialize tasks on component mount
onMounted(async () => {
  try {
    const dpiaFormValidation: t.Validation<t.TypeOf<typeof DPIA>> = DPIA.decode(dpia_json)
    validateData<t.TypeOf<typeof DPIA>>(dpiaFormValidation, (validData) => {
      taskStore.init(validData.tasks)
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

const {
  currentRootTaskId,
  goToNext,
  goToPrevious,
  isFirstTask,
  isLastTask
} = useTaskNavigation()
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
        <p class="utrecht-button-group" role="group" aria-label="Formulier navigatie">
          <Button v-if="!isFirstTask" variant="secondary" label="Vorige stap" @click="goToPrevious" />
          <Button v-if="!isLastTask" variant="primary" label="Volgende stap" @click="goToNext" />
        </p>

      </div>
    </div>
  </div>
</template>

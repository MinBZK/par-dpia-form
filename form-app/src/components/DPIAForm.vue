<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import dpia_json from '@/assets/DPIA.json'
import TaskSection from '@/components/TaskSection.vue'
import Banner from '@/components/Banner.vue'
import ProgressTracker from '@/components/ProgressTracker.vue'
import { fold } from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { DPIA } from '@/models/dpia.ts'
import { useTaskStore } from '@/stores/tasks'

const error = ref<string | null>(null)
const isLoading = ref(true)

const taskStore = useTaskStore()
const { flatTasks, currentTaskId } = storeToRefs(taskStore)

const handleValidationErrors = (errors: t.Errors): never => {
  const errorLocations = errors.map((err) => err.context.map((c) => c.key).join('.'))
  errorLocations.forEach((location) => console.error(`Error at: ${location}`))
  throw new Error(
    `JSON decoder could not validate data, problem(s) found at ${errorLocations.join(', ')}`,
  )
}

const validateData = <T,>(validation: t.Validation<any>, onSuccess: (data: T) => void): void => {
  fold(handleValidationErrors, onSuccess)(validation)
}

// Initialize the flattendTaskStore with tasks.
onMounted(async () => {
  try {
    const dpiaFormValidation: t.Validation<any> = DPIA.decode(dpia_json)
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

const hasTasks = computed(() => flatTasks.value || Object.keys(flatTasks.value).length > 0)

const rootTasks = computed(() => taskStore.getRootTasks)

const currentTask = computed(() => taskStore.taskById(currentTaskId.value))

const currentTaskKey = computed(() => `task-${currentTaskId.value}`)

const handleNextTask = () => {
  taskStore.nextTask()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handlePreviousTask = () => {
  taskStore.previousTask()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <Banner />
  <div v-if="isLoading">
    <p>Ophalen van DPIA taken ...</p>
  </div>

  <!-- Show decoding error if decoding has failed. -->
  <div v-else-if="error">
    <h2 class="utrecht-heading-2">Foutmelding</h2>
    <p>Er is iets mis gegaan bij het inlezen van de vragen.</p>
    <pre>{{ error }}</pre>
  </div>

  <!-- If all is well, render the tasks. -->
  <div v-else class="rvo-sidebar-layout rvo-max-width-layout rvo-max-width-layout--lg">
    <div class="rvo-sidebar-layout__sidebar">
      <ProgressTracker :rootTasks="rootTasks" />
    </div>

    <div class="rvo-sidebar-layout__content">
      <div v-if="!hasTasks" class="content">
        <p>Geen taken gevonden in de DPIA.</p>
      </div>

      <div v-else>
        <TaskSection :key="currentTaskKey" :task="currentTask" />
        <div class="rvo-layout-margin-vertical--xl">
          <p class="utrecht-button-group">
            <button v-if="currentTaskId != '0'"
              class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md" type="button"
              @click="handlePreviousTask">
              Vorige stap
            </button>
            <button v-if="currentTaskId != (rootTasks.length - 1).toString()"
              class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md" @click="handleNextTask"
              type="button">
              Volgende stap
            </button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

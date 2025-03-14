<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import dpia_json from '@/assets/DPIA.json'
import TaskSection from '@/components/TaskSection.vue'
import Banner from '@/components/Banner.vue'
import { fold } from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { DPIA } from '@/models/dpia.ts'
import { useTaskStore } from '@/stores/tasks'

const error = ref<string | null>(null)
const isLoading = ref(true)

const taskStore = useTaskStore()
const { flatTasks, rootTaskIds, currentTaskId } = storeToRefs(taskStore)

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

const hasTasks = Object.keys(flatTasks).length == 0
</script>

<template>
  <Banner />

  <div
    class="rvo-layout-column rvo-max-width-layout rvo-layout-align-items-center rvo-max-width-layout-inline-padding--sm"
  >
    <!-- Load screen when tasks are being decoded. -->
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
    <div class="rvo-layout-column rvo-layout-gap--2xl" v-else>
      <div class="rvo-select-wrapper">
        <select
          v-model="currentTaskId"
          class="utrecht-select utrecht-select--html-select utrecht-select--lg"
        >
          <option v-for="id in rootTaskIds" :key="id" :value="id">
            {{ id }}: {{ taskStore.taskById(id).task }}
          </option>
        </select>
      </div>

      <div v-if="hasTasks" class="content">
        <p>Geen taken gevonden in de DPIA.</p>
      </div>

      <div v-else>
        <TaskSection
          :key="`task-${currentTaskId.value}`"
          :task="taskStore.taskById(currentTaskId)"
        />
      </div>
    </div>
  </div>
</template>

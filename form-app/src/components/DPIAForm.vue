<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import dpia_json from '@/assets/DPIA.json'
import TaskView from '@/components/TaskView.vue'
import Banner from '@/components/Banner.vue'
import { fold } from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { Tasks, DPIA } from '@/models/dpia.ts'

const error = ref<string | null>(null)
const tasks = ref<Tasks>([])
const isLoading = ref(true)

const handleValidationErrors = (errors: t.Errors): never => {
  const errorLocations = errors.map((err) => err.context.map((c) => c.key).join('.'))
  errorLocations.forEach((location) => console.error(`Error at: ${location}`))
  throw new Error(`Could not validate data, problem(s) found at ${errorLocations.join(', ')}`)
}

const validateData = <T>(validation: t.Validation<any>, onSuccess: (data: T) => void): void => {
  fold(handleValidationErrors, onSuccess)(validation)
}

onMounted(async () => {
  try {
    const dpiaFormValidation: t.Validation<any> = DPIA.decode(dpia_json)
    validateData<t.TypeOf<typeof DPIA>>(dpiaFormValidation, (validData) => {
      tasks.value = validData.tasks
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

const formattedTasks = computed(() => {
  return tasks.value
})
</script>

<template>
  <div>
    <Banner />
    <div class="dpia-container">
      <div v-if="isLoading" class="loading">
        <div class="loading-spinner"></div>
        <p>Ophalen van DPIA taken ...</p>
      </div>

      <div v-else-if="error" class="error">
        <h2>Validation Error</h2>
        <pre class="error-message">{{ error }}</pre>
        <p class="error-help">
          Controleer de DPIA JSON datastructuur en zorgt dat deze voldoet aan het schema.
        </p>
      </div>

      <div v-else class="content">
        <header>
          <h1>DPIA Tasks</h1>
        </header>

        <div v-if="tasks.length === 0" class="empty-state">
          <p>No tasks found in the DPIA data.</p>
        </div>

        <section v-else>
          <!-- Use the TaskView component for each task -->
          <div v-for="task in formattedTasks" :key="task.urn" class="task-card">
            <TaskView :task="task" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dpia-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.error {
  padding: 1rem;
  border-left: 4px solid #e74c3c;
  background-color: #fef5f5;
  margin: 1rem 0;
}

.error-message {
  background-color: #f9e8e8;
  padding: 0.75rem;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.9rem;
}

.error-help {
  color: #7b7b7b;
  font-style: italic;
  margin-top: 0.5rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.summary {
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  background-color: #f9f9f9;
  border-radius: 8px;
}

.tasks-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.task-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0;
  /* Removed padding as TaskView has its own */
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
</style>

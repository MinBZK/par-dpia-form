<script setup lang="ts">
import { computed, inject } from 'vue'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { type FlatTask, useTaskStore, taskIsOfTaskType } from '../stores/tasks'
import { PERSISTENCE_KEY } from '../persistence'

defineProps<{
  disabled?: boolean
  navigable?: boolean
}>()

const taskStore = useTaskStore()
const { currentRootTaskId, rootTasks, goToTask: rawGoToTask } = useTaskNavigation()
const persistence = inject(PERSISTENCE_KEY)

const goToTask = (taskId: string) => {
  if (persistence?.flushSave) persistence.flushSave()
  rawGoToTask(taskId)
}

// Split: regular tasks vs conclusion task (type includes 'signing')
const regularTasks = computed(() =>
  rootTasks.value.filter(t => !t.type?.includes('signing'))
)
const conclusionTask = computed(() =>
  rootTasks.value.find(t => t.type?.includes('signing'))
)

function displayTitle(task: FlatTask): string {
  const shouldSkipIdPrefix = !task.is_official_id || (task.type && (task.type.includes('signing') || task.type.includes('informational')))

  return shouldSkipIdPrefix
    ? task.task
    : `${task.id}. ${task.task}`;
}

function isInformational(task: FlatTask): boolean {
  return taskIsOfTaskType(task, 'informational')
}
</script>

<template>
  <div class="rvo-progress-tracker">
    <div
      class="rvo-progress-tracker__step rvo-progress-tracker__step--md rvo-progress-tracker__step--start rvo-image-bg-progress-tracker-start-end-md--after rvo-progress-tracker__step--straight rvo-image-bg-progress-tracker-line-straight--before"
    >
      Inhoudsopgave
    </div>
    <div v-for="task in regularTasks" :key="task.id">
      <div
        :class="[
          'rvo-progress-tracker__step',
          'rvo-progress-tracker__step--md',
          isInformational(task)
            ? 'rvo-progress-tracker__step--informational rvo-image-bg-progress-tracker-start-end-md--after'
            : disabled
            ? 'rvo-progress-tracker__step--disabled rvo-image-bg-progress-tracker-incomplete-md--after'
            : taskStore.isRootTaskCompleted(task.id)
              ? 'rvo-progress-tracker__step--completed rvo-image-bg-progress-tracker-completed-md--after'
              : task.id === currentRootTaskId
                ? 'rvo-progress-tracker__step--doing rvo-image-bg-progress-tracker-doing-md--after'
                : 'rvo-progress-tracker__step--incomplete rvo-image-bg-progress-tracker-incomplete-md--after',
          'rvo-progress-tracker__step--straight',
          'rvo-image-bg-progress-tracker-line-straight--before',
        ]"
      >
        <div v-if="disabled || !navigable" class="small-text">
          {{ displayTitle(task) }}
        </div>
        <a
          v-else
          class="rvo-link rvo-progress-tracker__step-link small-text"
          @click="goToTask(task.id)"
        >
          {{ displayTitle(task) }}
        </a>
      </div>
    </div>
    <!-- Conclusion task as end step (small dot) -->
    <div
      v-if="conclusionTask"
      class="rvo-progress-tracker__step rvo-progress-tracker__step--sm rvo-progress-tracker__step--end rvo-image-bg-progress-tracker-start-end-sm--after"
    >
      <a
        v-if="!disabled && navigable"
        class="rvo-link rvo-progress-tracker__step-link small-text"
        @click="goToTask(conclusionTask.id)"
      >
        {{ conclusionTask.task }}
      </a>
      <div v-else class="small-text">
        {{ conclusionTask.task }}
      </div>
    </div>
    <div
      v-else
      class="rvo-progress-tracker__step rvo-progress-tracker__step--sm rvo-progress-tracker__step--end rvo-image-bg-progress-tracker-start-end-sm--after"
    >
      Proces voltooid
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { type FlatTask, useTaskStore } from '@/stores/tasks'

defineProps<{
  rootTasks: FlatTask[]
  disabled?: boolean
}>()

const taskStore = useTaskStore()
const { currentRootTaskId, goToTask } = useTaskNavigation()

function displayTitle(task: FlatTask): string {
  if (task.id === '0' || task.type?.includes('signing')) {
    return task.task
  } else {
    return task.id + ". " + task.task
  }
}

</script>

<template>
  <div class="rvo-progress-tracker">
    <div
      class="rvo-progress-tracker__step rvo-progress-tracker__step--md rvo-progress-tracker__step--start rvo-image-bg-progress-tracker-start-end-md--after rvo-progress-tracker__step--straight rvo-image-bg-progress-tracker-line-straight--before">
      Rapportagemodel
    </div>
    <div v-for="task in rootTasks" :key="task.id">
      <div :class="[
        'rvo-progress-tracker__step',
        'rvo-progress-tracker__step--md',
        disabled
          ? 'rvo-progress-tracker__step--disabled rvo-image-bg-progress-tracker-incomplete-md--after'
          : taskStore.isRootTaskCompleted(task.id)
            ? 'rvo-progress-tracker__step--completed rvo-image-bg-progress-tracker-completed-md--after'
            : task.id === currentRootTaskId
              ? 'rvo-progress-tracker__step--doing rvo-image-bg-progress-tracker-doing-md--after'
              : 'rvo-progress-tracker__step--incomplete rvo-image-bg-progress-tracker-incomplete-md--after',
        'rvo-progress-tracker__step--straight',
        'rvo-image-bg-progress-tracker-line-straight--before',
      ]">
        <div v-if="disabled" class="small-text">
          {{ displayTitle(task) }}
        </div>
        <a v-else class="rvo-link rvo-progress-tracker__step-link small-text" @click="goToTask(task.id)">
          {{ displayTitle(task) }}
        </a>
      </div>
    </div>
    <div
      class="rvo-progress-tracker__step rvo-progress-tracker__step--md rvo-progress-tracker__step--end rvo-image-bg-progress-tracker-start-end-md--after">
      Proces voltooid
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskNavigation } from '@/composables/useTaskNavigation'
import { type FlatTask, useTaskStore } from '@/stores/tasks'


const taskStore = useTaskStore()
const { currentRootTaskId, goToTask } = useTaskNavigation()

defineProps<{
  rootTasks: FlatTask[]
}>()
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
        taskStore.isRootTaskCompleted(task.id)
          ? 'rvo-progress-tracker__step--completed rvo-image-bg-progress-tracker-completed-md--after'
          : task.id === currentRootTaskId
          ? 'rvo-progress-tracker__step--doing rvo-image-bg-progress-tracker-doing-md--after'
          : 'rvo-progress-tracker__step--incomplete rvo-image-bg-progress-tracker-incomplete-md--after',
        'rvo-progress-tracker__step--straight',
        'rvo-image-bg-progress-tracker-line-straight--before',
      ]">
        <a class="rvo-link rvo-progress-tracker__step-link small-text" @click="goToTask(task.id)">
          {{ task.id !== '0' ? `${task.id}.` : `` }} {{ task.task }}
        </a>
      </div>
    </div>
    <div
      class="rvo-progress-tracker__step rvo-progress-tracker__step--md rvo-progress-tracker__step--end rvo-image-bg-progress-tracker-start-end-md--after">
      Proces voltooid
    </div>
  </div>
</template>

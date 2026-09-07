<script setup lang="ts">
import FormField from './FormField.vue'
import { useTaskStore } from '../../stores/tasks'

defineProps<{
  taskId: string
  instanceId: string
  showDescription?: boolean
}>()

const taskStore = useTaskStore()
</script>

<template>
  <div class="task-fieldset">
    <fieldset class="task-fieldset__fieldset">
      <div role="group" class="task-fieldset__content">
        <FormField
          :task="taskStore.taskById(taskId)"
          :instanceId="instanceId"
          :label="taskStore.taskById(taskId).task"
          :description="showDescription ? taskStore.taskById(taskId).description : ''"
        />
      </div>
    </fieldset>
  </div>
</template>

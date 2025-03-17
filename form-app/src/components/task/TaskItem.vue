<script setup lang="ts">
import { useTaskStore } from '@/stores/tasks'
import FormField from '@/components/task/FormField.vue'

defineProps<{
  taskId: string,
  instance: number,
}>()

const taskStore = useTaskStore()
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
      <div role="group" class="utrecht-form-field utrecht-form-field--text rvo-form-field">
        <FormField :task="taskStore.taskById(taskId)" :instance="instance" :label="taskStore.taskById(taskId).task" />
      </div>
    </fieldset>
  </div>
</template>

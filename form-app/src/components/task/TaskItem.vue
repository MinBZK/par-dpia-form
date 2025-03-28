<script setup lang="ts">
import FormField from '@/components/task/FormField.vue'
import { useTaskStore } from '@/stores/tasks'

defineProps<{
  taskId: string
  instanceId: string
  showDescription?: boolean
}>()

const taskStore = useTaskStore()
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
      <div role="group" class="utrecht-form-field utrecht-form-field--text rvo-form-field">
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

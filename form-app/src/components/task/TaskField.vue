<script setup lang="ts">
import FormField from '@/components/task/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { useTaskStore, type FlatTask } from '@/stores/tasks'
import { renderInstanceLabel } from '@/utils/taskLabels'
import { computed, nextTick } from 'vue'

const props = defineProps<{
  taskId: string
  instanceId: string
}>()

const taskStore = useTaskStore()

const { shouldShowTask, canUserCreateInstances, syncInstances } = useTaskDependencies()
const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))
const isRepeatable = computed(() => task.value.repeatable === true)

const instanceLabel = computed(() => {
  if (task.value.instance_label_template) {
    return renderInstanceLabel(props.instanceId, task.value.instance_label_template)
  }
  return isRepeatable.value ? `${task.value.task} item` : task.value.task
})

const handleDelete = (instanceId: string) => {
  taskStore.removeRepeatableTaskInstance(instanceId)
  nextTick(() => {
    syncInstances.value()
  })
}
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset
      class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset"
      :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
    >
      <legend
        class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
        :id="`group-${taskId}-${instanceId}-legend`"
      >
        {{ instanceLabel }}
      </legend>

      <div
        role="group"
        :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
        class="utrecht-form-field utrecht-form-field--text rvo-form-field"
      >
        <div v-for="childId in task.childrenIds" :key="childId">
          <template
            v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
            :key="childInstanceId"
          >
            <template v-if="shouldShowTask(childId, childInstanceId)">
              <FormField
                :task="taskStore.taskById(childId)"
                :instanceId="childInstanceId"
                :label="taskStore.taskById(childId).task"
                :description="taskStore.taskById(childId).description"
              />
            </template>
          </template>
        </div>
      </div>
      <UiButton
        v-if="isRepeatable && canUserCreateInstances(taskId)"
        variant="secondary"
        icon="verwijderen"
        label="Verwijder veld"
        @click="handleDelete(props.instanceId)"
      />
    </fieldset>
  </div>
</template>

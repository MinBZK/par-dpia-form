<script setup lang="ts">
import { computed } from 'vue'
import { type FlatTask, useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import UiButton from '@/components/ui/UiButton.vue'
import FormField from '@/components/task/FormField.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { renderInstanceLabel } from '@/utils/taskLabels'

const props = defineProps<{
  taskId: string
  instanceId: string
}>()

const taskStore = useTaskStore()
const answerStore = useAnswerStore()

const { shouldShowTask } = useTaskDependencies()
const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))
const isRepeatable = computed(() => task.value.repeatable === true)

const instance = computed(() => {
  taskStore.getInstanceById(props.instanceId) || {
    id: props.instanceId,
    taskId: props.taskId,
    index: 0,
    childInstanceIds: [],
  }
})

const instanceLabel = computed(() => {
  if (task.value.instance_label_template) {
    return renderInstanceLabel(props.instanceId, task.value.instance_label_template)
  }
  return isRepeatable.value ? `${task.value.task} item` : task.value.task
})

const removeInstance = (instanceId: string) => {
  taskStore.removeRepeatableTaskInstance(instanceId)
}
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset
      class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset"
      :aria-labelledby="`group-${taskId}-${instance}-legend`"
    >
      <legend
        class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
        :id="`group-${taskId}-${instance}-legend`"
      >
        {{ instanceLabel }}
      </legend>

      <div
        role="group"
        :aria-labelledby="`group-${taskId}-${instance}-legend`"
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
        v-if="isRepeatable"
        variant="secondary"
        icon="verwijderen"
        label="Verwijder veld"
        @click="removeInstance(props.instanceId)"
      />
    </fieldset>
  </div>
</template>

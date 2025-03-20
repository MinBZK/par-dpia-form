<script setup lang="ts">
import { computed } from 'vue'
import { type FlatTask, useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import UiButton from '@/components/ui/UiButton.vue'
import FormField from '@/components/task/FormField.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'

const props = defineProps<{
  taskId: string,
  instance: number,
}>()

const taskStore = useTaskStore()
const answerStore = useAnswerStore()

const { shouldShowTask } = useTaskDependencies()
const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))
const isRepeatable = computed(() => task.value.repeatable === true)

const removeInstance = (taskId: string, instance: number) => {
  taskStore.removeRepeatableTaskInstance(taskId)
  answerStore.removeAnswer(taskId, instance)
}
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset"
      :aria-labelledby="`group-${taskId}-${instance}-legend`">

      <legend class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
        :id="`group-${taskId}-${instance}-legend`">
        {{ taskStore.taskById(taskId).task }} {{ isRepeatable === true ? `item ${instance}` : "" }}
      </legend>

      <div role="group" :aria-labelledby="`group-${taskId}-${instance}-legend`"
        class="utrecht-form-field utrecht-form-field--text rvo-form-field">

        <div v-for="childId in taskStore.taskById(taskId).childrenIds" :key="childId">
          <template v-if="shouldShowTask(childId, instance)">
            <FormField :task="taskStore.taskById(childId)" :instance="instance"
              :label="taskStore.taskById(childId).task" :description="taskStore.taskById(childId).description" />
          </template>
        </div>
      </div>
      <UiButton v-if="isRepeatable" variant="secondary" icon="verwijderen" label="Verwijder veld"
        @click="removeInstance(taskId, instance)" />
    </fieldset>
  </div>
</template>

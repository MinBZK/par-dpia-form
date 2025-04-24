<script setup lang="ts">
import FormField from '@/components/task/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { useTaskStore, type FlatTask } from '@/stores/tasks'
import { renderInstanceLabel } from '@/utils/taskUtils'
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

const childTasksWithChildren = computed(() => {
  return task.value.childrenIds.filter((childId) => {
    const childTask = taskStore.taskById(childId)
    return childTask.childrenIds && childTask.childrenIds.length > 0
  })
})

const childTasksWithoutChildren = computed(() => {
  return task.value.childrenIds.filter((childId) => {
    const childTask = taskStore.taskById(childId)
    return !childTask.childrenIds || childTask.childrenIds.length === 0
  })
})

function hasMoreThanOneInstance(taskId: string, parentInstanceId?: string) {
  if (!parentInstanceId) {
    const instance = taskStore.getInstanceById(props.instanceId)
    parentInstanceId = instance?.parentInstanceId || undefined
  }
  return taskStore.getInstancesForTask(taskId, parentInstanceId).length > 1
}

function hasVisibleInstance(taskId: string): boolean {
  const instanceIds = taskStore.getInstanceIdsForTask(taskId, props.instanceId)
  if (instanceIds.length === 0) return false
  return instanceIds.some((instanceId) => shouldShowTask.value(taskId, instanceId))
}

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
      class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset rvo-margin-block-start--xs rvo-margin-inline-start--xs"
      :aria-labelledby="`group-${taskId}-${instanceId}-legend`">
      <legend class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
        :id="`group-${taskId}-${instanceId}-legend`" v-html="instanceLabel"></legend>

      <div
        role="group"
        :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
        class="utrecht-form-field utrecht-form-field--text rvo-form-field"
      >
        <!-- Simple fields without children -->
        <template v-for="childId in childTasksWithoutChildren" :key="`simple-${childId}`">
          <template v-if="!taskStore.taskById(childId).repeatable">
            <!-- Non-repeatable simple fields -->
            <template
              v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`simple-norep-${childInstanceId}`"
            >
              <FormField
                v-if="shouldShowTask(childId, childInstanceId)"
                :task="taskStore.taskById(childId)"
                :instanceId="childInstanceId"
                :label="taskStore.taskById(childId).task"
                :description="taskStore.taskById(childId).description"
              />
            </template>
          </template>
          <template v-else>
            <!-- Repeatable simple fields -->
            <div
              v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`simple-rep-${childInstanceId}`"
            >
              <div v-if="shouldShowTask(childId, childInstanceId)">
                <FormField
                  :task="taskStore.taskById(childId)"
                  :instanceId="childInstanceId"
                  :label="taskStore.taskById(childId).task"
                  :description="taskStore.taskById(childId).description"
                />

                <!-- Only show delete button for repeatable children instances -->
                <UiButton
                  v-if="
                    canUserCreateInstances(childId) &&
                    hasMoreThanOneInstance(childId, props.instanceId)
                  "
                  variant="warning"
                  icon="verwijderen"
                  label="Verwijder veld"
                  @click="handleDelete(childInstanceId)"
                />
              </div>
            </div>

            <!-- Add button for repeatable field -->
            <div v-if="canUserCreateInstances(childId)" class="rvo-layout-margin-vertical--md">
              <UiButton
                variant="tertiary"
                icon="plus"
                :label="`Voeg ${getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                @click="taskStore.addRepeatableTaskInstance(childId, instanceId)"
              />
            </div>
          </template>
        </template>

        <!-- Complex task groups with children -->
        <template v-for="childId in childTasksWithChildren" :key="`complex-${childId}`">
          <template v-if="!taskStore.taskById(childId).repeatable">
            <!-- Non-repeatable task groups -->
            <template
              v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`complex-nonrep-${childInstanceId}`"
            >
              <div v-if="shouldShowTask(childId, childInstanceId)">
                <TaskGroup :taskId="childId" :instanceId="childInstanceId" />
              </div>
            </template>
          </template>
          <template v-else>
            <!-- Repeatable task groups -->
            <div
              v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`complex-rep-${childInstanceId}`"
            >
              <div v-if="shouldShowTask(childId, childInstanceId)" class="rvo-margin-block-end--md">
                <TaskGroup
                  :taskId="childId"
                  :instanceId="childInstanceId"
                  class="rvo-margin-block-end--md background-grijs-200"
                />
              </div>
            </div>

            <!-- Add button for repeatable task group (outside the loop) -->
            <div
              v-if="canUserCreateInstances(childId) && hasVisibleInstance(childId)"
              class="rvo-card background-grijs-200 rvo-padding-block-start--xs rvo-padding-block-end--xs"
            >
              <UiButton
                variant="tertiary"
                icon="plus"
                :label="`Voeg ${getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                @click="taskStore.addRepeatableTaskInstance(childId, instanceId)"
              />
            </div>
          </template>
        </template>
      </div>

      <!-- Button to delete the current task group instance (only shown for the parent component) -->
      <UiButton
        v-if="isRepeatable && canUserCreateInstances(taskId) && hasMoreThanOneInstance(taskId)"
        variant="warning"
        icon="verwijderen"
        :label="`Verwijder ${getPlainTextWithoutDefinitions(task.task.toLowerCase())}`"
        @click="handleDelete(props.instanceId)"
      />
    </fieldset>
  </div>
</template>

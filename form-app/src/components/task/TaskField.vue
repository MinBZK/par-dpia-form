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

const childTasksWithChildren = computed(() => {
  return task.value.childrenIds.filter(childId => {
    const childTask = taskStore.taskById(childId)
    return childTask.childrenIds && childTask.childrenIds.length > 0
  })
})

const childTasksWithoutChildren = computed(() => {
  return task.value.childrenIds.filter(childId => {
    const childTask = taskStore.taskById(childId)
    return !childTask.childrenIds || childTask.childrenIds.length === 0
  })
})

function hasMoreThanOneInstance(taskId: string, parentInstanceId?: string) {
  if (!parentInstanceId) {
    const instance = taskStore.getInstanceById(props.instanceId);
    parentInstanceId = instance?.parentInstanceId || undefined;
  }
  return taskStore.getInstancesForTask(taskId, parentInstanceId).length > 1
}

const handleDelete = (instanceId: string) => {
  taskStore.removeRepeatableTaskInstance(instanceId);
  nextTick(() => {
    syncInstances.value();
  });
}
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset"
      :aria-labelledby="`group-${taskId}-${instanceId}-legend`">
      <legend class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
        :id="`group-${taskId}-${instanceId}-legend`">
        {{ instanceLabel }}
      </legend>

      <div role="group" :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
        class="utrecht-form-field utrecht-form-field--text rvo-form-field">

        <!-- Simple fields without children -->
        <div v-for="childId in childTasksWithoutChildren" :key="`simple-${childId}`">
          <template v-if="!taskStore.taskById(childId).repeatable">
            <!-- Non-repeatable simple fields -->
            <template v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`simple-norep-${childInstanceId}`">
              <FormField v-if="shouldShowTask(childId, childInstanceId)" :task="taskStore.taskById(childId)"
                :instanceId="childInstanceId" :label="taskStore.taskById(childId).task"
                :description="taskStore.taskById(childId).description" />
            </template>
          </template>
          <template v-else>
            <!-- Repeatable simple fields -->
            <div v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`simple-rep-${childInstanceId}`">
              <div v-if="shouldShowTask(childId, childInstanceId)">
                <FormField :task="taskStore.taskById(childId)" :instanceId="childInstanceId"
                  :label="taskStore.taskById(childId).task" :description="taskStore.taskById(childId).description" />

                <!-- Only show delete button for repeatable children instances -->
                <UiButton v-if="canUserCreateInstances(childId) && hasMoreThanOneInstance(childId, props.instanceId)" variant="secondary"
                  icon="verwijderen" label="Verwijder veld" @click="handleDelete(childInstanceId)" />
              </div>
            </div>

            <!-- Add button for repeatable field -->
            <div v-if="canUserCreateInstances(childId)" class="rvo-layout-margin-vertical--md">
              <UiButton variant="secondary" icon="plus" label="Voeg aanvullende informatie toe"
                @click="taskStore.addRepeatableTaskInstance(childId, instanceId)" />
            </div>
          </template>
        </div>

        <!-- Complex task groups with children -->
        <div v-for="childId in childTasksWithChildren" :key="`complex-${childId}`">
          <template v-if="!taskStore.taskById(childId).repeatable">
            <!-- Non-repeatable task groups -->
            <template v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`complex-nonrep-${childInstanceId}`">
              <div v-if="shouldShowTask(childId, childInstanceId)">
                <TaskField :taskId="childId" :instanceId="childInstanceId" />
              </div>
            </template>
          </template>
          <template v-else>
            <!-- Repeatable task groups -->
            <div v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
              :key="`complex-rep-${childInstanceId}`">
              <div v-if="shouldShowTask(childId, childInstanceId)">
                <TaskField :taskId="childId" :instanceId="childInstanceId" />
              </div>
            </div>

            <!-- Add button for repeatable task group (outside the loop) -->
            <div v-if="canUserCreateInstances(childId)" class="rvo-layout-margin-vertical--md">
              <UiButton variant="secondary" icon="plus" label="Voeg aanvullende informatie toe"
                @click="taskStore.addRepeatableTaskInstance(childId, instanceId)" />
            </div>
          </template>
        </div>
      </div>

      <!-- Button to delete the current task group instance (only shown for the parent component) -->
      <UiButton v-if="isRepeatable && canUserCreateInstances(taskId) && hasMoreThanOneInstance(taskId)"
      variant="secondary" icon="verwijderen" :label="`Verwijder ${task.task.toLowerCase()}`" @click="handleDelete(props.instanceId)" />
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import TaskField from '@/components/task/TaskField.vue'
import TaskItem from '@/components/task/TaskItem.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { type FlatTask, useTaskStore } from '@/stores/tasks'
import { computed } from 'vue'

const props = defineProps<{
  taskId: string
}>()

const taskStore = useTaskStore()

const { canUserCreateInstances } = useTaskDependencies()

const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))

const shouldShowChildren = computed(
  () => task.value.type?.includes('task_group') && (task.value.childrenIds?.length || 0) > 0,
)

const isSigningTask = computed(
  () => task.value.type?.includes("signing")
)

const isRepeatable = (taskId: string) => {
  return taskStore.taskById(taskId).repeatable === true
}

const resolveImagePath = (image: string): string => {
  return '/src/assets/images/' + image
}

const taskDisplayTitle = (task: FlatTask): string => {
  if (task.id === '0' || isSigningTask.value) {
    return task.task
  } else {
    return task.id + '. ' + task.task
  }
}
</script>

<template>
  <div class="rvo-layout-margin-vertical--s">
    <!-- Task header -->
    <h1 class="utrecht-heading-1">{{ taskDisplayTitle(task) }}</h1>

    <div v-if="isSigningTask" class="rvo-layout-column rvo-layout-gap--2xl">
      <div class="utrecht-form-fieldset rvo-form-fieldset">
        <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
          <p class="utrecht-paragraph preserve-whitespace">
            {{ task.description }}
          </p>
        </fieldset>
      </div>
    </div>


    <div v-else class="rvo-layout-column rvo-layout-gap--2xl">

      <div class="rvo-checkbox__group">
        <label class="rvo-checkbox rvo-checkbox--not-checked" for="`${taskId}-completed`">
          <input id="`${taskId}-completed`" name="step_completed" class="rvo-checkbox__input" type="checkbox"
            :checked="taskStore.isRootTaskCompleted(taskId)" @change="taskStore.toggleCompleteForTaskId(taskId)" />
          Markeer als voltooid
        </label>
      </div>

      <!-- Description section (if available) -->
      <div v-if="task.description" class="utrecht-form-fieldset rvo-form-fieldset">
        <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset  rvo-margin-block-start--xs rvo-margin-inline-start--xs">
          <p class="utrecht-paragraph preserve-whitespace">
            {{ task.description }}
          </p>
          <template v-if="task.sources">
            <template v-for="source in task.sources" :key="source">
              <img :src="resolveImagePath(source.source)" :alt="source.description" />
            </template>
          </template>
        </fieldset>
      </div>

      <!-- If task is a task group and it has child tasks, show the child tasks -->
      <div v-if="shouldShowChildren" class="rvo-layout-column rvo-layout-gap--2xl">
        <template v-for="childId in task.childrenIds" :key="childId">
          <template v-for="instanceId in taskStore.getInstanceIdsForTask(childId)" :key="instanceId">
            <!--Single task (no children): render the task itself -->
            <TaskItem v-if="!taskStore.taskById(childId).childrenIds.length" :taskId="childId" :instanceId="instanceId"
              :showDescription="true" />

            <!-- Nested task group (has children): render children as TaskField -->
            <TaskField v-else :taskId="childId" :instanceId="instanceId" />
          </template>

          <div v-if="isRepeatable(childId) && canUserCreateInstances(childId)"
            class="utrecht-form-fieldset rvo-form-fieldset">
            <UiButton variant="tertiary" icon="plus" :label="`Voeg extra
            ${taskStore.taskById(childId).task.toLowerCase()} toe`"
              @click="taskStore.addRepeatableTaskInstance(childId)"/>
          </div>
        </template>
      </div>

      <!-- Single task: render the task itself -->
      <TaskItem v-else :taskId="taskId" :instanceId="taskStore.getInstanceIdsForTask(taskId)[0] || ''" />
    </div>
  </div>
</template>

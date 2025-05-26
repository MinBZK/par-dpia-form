<script setup lang="ts">
import TaskGroup from '@/components/task/TaskGroup.vue'
import TaskItem from '@/components/task/TaskItem.vue'
import UiButton from '@/components/ui/UiButton.vue'
import Results from '@/components/Results.vue'
import PreScanPreview from '@/components/PreScanPreview.vue'
import { FormType } from '@/models/dpia.ts'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'
import { useTaskDependencies } from '@/composables/useTaskDependencies'
import { type FlatTask, taskIsOfTaskType, useTaskStore } from '@/stores/tasks'
import { computed } from 'vue'
import risicoMatrixImage from '@/assets/images/risico_matrix.png'

const props = defineProps<{
  taskId: string
}>()

const taskStore = useTaskStore()

const { canUserCreateInstances, hasSourceTaskValues, getDependencySourceTaskId } = useTaskDependencies()

const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))

const shouldShowChildren = computed(
  () => taskIsOfTaskType(task.value, 'task_group') && (task.value.childrenIds?.length || 0) > 0,
)

const isSigningTask = computed(() => taskIsOfTaskType(task.value, 'signing'))

const activeNamespace = computed(() => taskStore.activeNamespace)

const hasPreScanReferences = computed(() => {
  if (activeNamespace.value !== FormType.DPIA) return false;

  if (isSigningTask.value) return false;

  const preScanTasks = Object.values(taskStore.getTasksFromNamespace(FormType.PRE_SCAN));

  // If we're looking at root task "1", check for references to "1", "1.1", "1.2", etc.
  return preScanTasks.some(task =>
    task.references &&
    task.references.DPIA
  )
})

const shouldShowPreScanPreview = computed(() => hasPreScanReferences.value)

const isRepeatable = (taskId: string) => {
  return taskStore.taskById(taskId).repeatable === true
}

const taskDisplayTitle = (task: FlatTask): string => {
  const shouldSkipIdPrefix = (task.is_official_id === false) || (task.type && task.type.includes('signing'));
  return shouldSkipIdPrefix
    ? task.task
    : `${task.id}. ${task.task}`;
}

const missingSourceDependencies = computed(() => {
  if (!task.value.childrenIds) return []

  const dependencies = []

  for (const childId of task.value.childrenIds) {
    const childTask = taskStore.taskById(childId)
    const sourceId = getDependencySourceTaskId.value(childTask)

    if (sourceId) {
      const sourceStatus = hasSourceTaskValues.value(childTask)

      if (!sourceStatus.hasValues) {
        // Get the major section number (e.g., "4" from "4.1.1")
        const mainSectionNumber = sourceId.split('.')[0]
        const mainTask = taskStore.taskById(mainSectionNumber)
        const mainTaskHeader = mainTask ? mainTask.task : mainSectionNumber

        dependencies.push({
          childId,
          sourceId,
          sectionNumber: mainSectionNumber,
          sectionName: mainTaskHeader
        })
      }
    }
  }

  // Return unique dependencies by section number
  return dependencies.filter((dep, index, self) =>
    index === self.findIndex(d => d.sectionNumber === dep.sectionNumber)
  )
})

const imageMap = {
  'risico_matrix.png': risicoMatrixImage,
}

// Helper function with proper type safety
function getImage(key: string): string | undefined {
  return key in imageMap ? imageMap[key as keyof typeof imageMap] : undefined
}

function handleAddRepeatableTask(childId: string) {
  try {
    // When we create a repeatableTaskInstance we need to give a parentInstanceId. Since the
    // creation of an instance here always happens one level below a root task instance, we know
    // all instances that are created in a TaskSection have as a parent instance the unique
    // corresponding root instance (since we know only have one root task instance).
    const instanceIds = taskStore.getRootTaskInstanceIds(props.taskId)

    // This should never happen, because in our application root tasks cannot be created or
    // destroyed.
    if (instanceIds.length != 1) {
      throw new Error(`Root task ${props.taskId} should have exactly one instance`)
    }
    const rootInstanceId = instanceIds[0]
    taskStore.addRepeatableTaskInstance(childId, rootInstanceId)
  } catch (error) {
    console.error(`Failed to add repeatable task with TaskId ${props.taskId}: ${error}`)
    console.warn(
      'Could not properly create a new item because parent item is ambigious. The resulting form structure may be invalid.',
    )
    taskStore.addRepeatableTaskInstance(childId)
  }
}

function shouldSkipTask(taskId: string): boolean {
  const task = taskStore.taskById(taskId);
  const sourceId = getDependencySourceTaskId.value(task);

  if (!sourceId) {
    return false; // Not a mapped task, don't skip
  }

  const sourceStatus = hasSourceTaskValues.value(task);
  return !sourceStatus.hasValues; // Skip if source has no values
}

</script>

<template>
  <div class="rvo-layout-margin-vertical--s">
    <!-- Task header -->
    <h1 class="utrecht-heading-1">{{ taskDisplayTitle(task) }}</h1>

    <div v-if="isSigningTask" class="rvo-layout-column rvo-layout-gap--2xl">
      <div v-if="task.description" class="utrecht-form-fieldset rvo-form-fieldset">
        <fieldset
          class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset rvo-margin-block-start--xs rvo-margin-inline-start--xs">
          <p class="utrecht-paragraph preserve-whitespace" v-html="task.description"></p>
        </fieldset>
      </div>

      <Results v-if="activeNamespace === FormType.PRE_SCAN" />
    </div>

    <div v-else class="rvo-layout-column rvo-layout-gap--2xl">

      <!-- Show consolidated warnings for tasks that need to be filled in -->
      <div v-if="missingSourceDependencies.length > 0" class="rvo-alert rvo-alert--warning rvo-margin-block-end--md">
        <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing" role="img"
          aria-label="Waarschuwing"></span>
        <div class="rvo-alert-text">
          <p>Voor deze stap is het nodig eerst de volgende stappen in te vullen:</p>
          <ul class="utrecht-unordered-list">
            <li v-for="dep in missingSourceDependencies" :key="dep.sourceId" class="utrecht-unordered-list__item">
              Stap {{ dep.sectionNumber }}: {{ dep.sectionName }}
            </li>
          </ul>
        </div>
      </div>

      <!-- Description section (if available) -->
      <div v-if="task.description" class="utrecht-form-fieldset rvo-form-fieldset">
        <fieldset
          class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset rvo-margin-block-start--xs rvo-margin-inline-start--xs">
          <p class="utrecht-paragraph preserve-whitespace" v-html="task.description"></p>
          <template v-if="task.sources">
            <template v-for="source in task.sources" :key="source">
              <img v-if="source.source && source.source in imageMap" :src="getImage(source.source)"
                :alt="source.description" />
            </template>
          </template>
        </fieldset>
      </div>

      <PreScanPreview v-if="shouldShowPreScanPreview" :dpiaTaskId="task.id" />

      <!-- If task is a task group and it has child tasks, show the child tasks -->
      <div v-if="shouldShowChildren" class="rvo-layout-column rvo-layout-gap--2xl">
        <template v-for="childId in task.childrenIds" :key="childId">
          <template v-if="!shouldSkipTask(childId)">

            <template v-for="instanceId in taskStore.getInstanceIdsForTask(childId)" :key="instanceId">
              <!--Single task (no children): render the task itself -->
              <TaskItem v-if="!taskStore.taskById(childId).childrenIds.length" :taskId="childId"
                :instanceId="instanceId" :showDescription="true" />

              <!-- Nested task group (has children): render children as TaskGroup -->
              <TaskGroup v-else :taskId="childId" :instanceId="instanceId" />
            </template>

            <div v-if="isRepeatable(childId) && canUserCreateInstances(childId)"
              class="rvo-card background-grijs-100 rvo-padding-block-start--xs rvo-padding-block-end--xs">
              <UiButton variant="tertiary" icon="plus" :label="`Voeg extra
            ${getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                @click="handleAddRepeatableTask(childId)" />
            </div>
          </template>
        </template>
      </div>

      <!-- Single task: render the task itself -->
      <TaskItem v-else :taskId="taskId" :instanceId="taskStore.getInstanceIdsForTask(taskId)[0] || ''" />
    </div>
  </div>
</template>

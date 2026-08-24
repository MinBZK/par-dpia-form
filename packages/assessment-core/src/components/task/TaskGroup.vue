<script setup lang="ts">
import FormField from './FormField.vue'
import ConfirmDeleteDialog from '../ConfirmDeleteDialog.vue'
import '@nldd/design-system/banner'
import '@nldd/design-system/box'
import '@nldd/design-system/button'
import '@nldd/design-system/container'
import '@nldd/design-system/spacer'
import { getPlainTextWithoutDefinitions } from '../../utils/stripHtml'
import { useTaskDependencies } from '../../composables/useTaskDependencies'
import { useTaskStore, type FlatTask, type TaskInstance } from '../../stores/tasks'
import { useAnswerStore } from '../../stores/answers'
import { usePrefixQuestionIds } from '../../composables/usePrefixQuestionIds'
import { renderInstanceLabel } from '../../utils/taskUtils'
import { findImpactedByDelete, summariseImpact, type ImpactSummary } from '../../utils/impactedAnswers'
import { computed, inject, nextTick, ref } from 'vue'
import { CONTENT_READONLY_KEY } from '../../injectionKeys'

const props = defineProps<{
  taskId: string
  instanceId: string
  nestedInBox?: boolean
}>()

// Read-only role: the add and delete controls go inert, the rows stay readable.
const readonly = inject(CONTENT_READONLY_KEY, ref(false))

const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const { shouldShowTask, canUserCreateInstances, syncInstances} = useTaskDependencies()
const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))
const isRepeatable = computed(() => task.value.repeatable === true)

// A box inside a tinted box needs the base surface, otherwise the two rings
// sit on the same fill and the nesting stops reading.
const boxBackground = computed(() => (props.nestedInBox ? 'base' : 'tinted'))

const prefixQuestionIds = usePrefixQuestionIds()

const instanceLabel = computed(() => {
  if (task.value.instance_label_template) {
    return renderInstanceLabel(props.instanceId, task.value.instance_label_template)
  }
  const baseLabel = isRepeatable.value ? `${task.value.task}` : task.value.task
  if (prefixQuestionIds.value && task.value.is_official_id !== false) {
    return `${task.value.id} ${baseLabel}`
  }
  return baseLabel
})

// Nested groups render their legend with a label-sized font instead of a heading.
const isNestedGroup = computed(() => {
  const parentId = task.value.parentId
  if (!parentId) return false
  try {
    return taskStore.taskById(parentId).type?.includes('task_group') ?? false
  } catch {
    return false
  }
})

// When this instance is mapped to a source whose answer is still empty,
// produce a message pointing the user to where they need to fill it in.
const missingSourceMessage = computed<string | null>(() => {
  const mappingDep = task.value.dependencies?.find((d) => d.type === 'instance_mapping')
  if (!mappingDep?.source?.id) return null

  const instance = taskStore.getInstanceById(props.instanceId)
  if (!instance?.mappedFromInstanceId) return null

  const sourceAnswer = answerStore.getAnswer(instance.mappedFromInstanceId)
  if (sourceAnswer != null && sourceAnswer !== '') return null

  const sourceTask = taskStore.taskById(mappingDep.source.id)
  const sectionId = mappingDep.source.id.split('.')[0]
  const sectionTask = taskStore.taskById(sectionId)
  const fieldName = getPlainTextWithoutDefinitions(sourceTask.task)
  const sectionName = getPlainTextWithoutDefinitions(sectionTask.task)
  return `Vul eerst "${fieldName}" in bij sectie "${sectionId}. ${sectionName}".`
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

function collectInstanceIds(instanceId: string): string[] {
  const instance = taskStore.getInstanceById(instanceId)
  if (!instance) return [instanceId]
  const ids = [instanceId]
  for (const childId of instance.childInstanceIds) {
    ids.push(...collectInstanceIds(childId))
  }
  return ids
}

const pendingDelete = ref<{
  instanceId: string
  label: string
  summary: ImpactSummary
} | null>(null)

const runDelete = (instanceId: string) => {
  const idsToRemove = collectInstanceIds(instanceId)
  answerStore.removeAnswerForInstances(idsToRemove)
  taskStore.removeRepeatableTaskInstance(instanceId)
  nextTick(() => {
    syncInstances.value()
  })
}

const handleDelete = (instanceId: string) => {
  const impacted = findImpactedByDelete(instanceId, taskStore, answerStore)
  if (impacted.length === 0) {
    runDelete(instanceId)
    return
  }
  const targetTask = taskStore.getInstanceById(instanceId)
  const labelTemplate = targetTask
    ? taskStore.taskById(targetTask.taskId).instance_label_template
    : undefined
  const label = labelTemplate
    ? renderInstanceLabel(instanceId, labelTemplate)
    : getPlainTextWithoutDefinitions(task.value.task)
  pendingDelete.value = {
    instanceId,
    label: label.replace(/<[^>]+>/g, ''),
    summary: summariseImpact(impacted, taskStore),
  }
}

const confirmPendingDelete = () => {
  if (!pendingDelete.value) return
  const { instanceId } = pendingDelete.value
  pendingDelete.value = null
  runDelete(instanceId)
}

const cancelPendingDelete = () => {
  pendingDelete.value = null
}
</script>

<template>
  <div class="task-fieldset">
    <fieldset
      class="task-fieldset__fieldset"
      :aria-labelledby="`group-${taskId}-${instanceId}-legend`">
      <legend
        :class="isNestedGroup && prefixQuestionIds
          ? 'task-fieldset__legend--sub'
          : 'task-fieldset__legend'"
        :id="`group-${taskId}-${instanceId}-legend`" v-html="instanceLabel"></legend>

      <!-- Group-level description: an IAMA addition (gated on prefixQuestionIds, which only
           IAMA sets). DPIA/pre-scan never showed group descriptions, so keep them hidden there. -->
      <div v-if="task.description && prefixQuestionIds" class="task-fieldset__description"
        v-html="task.description"></div>

      <div role="group" :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
        class="task-fieldset__content">
        <nldd-banner v-if="missingSourceMessage" variant="warning" :text="missingSourceMessage"></nldd-banner>
        <template v-if="!missingSourceMessage">
        <!-- Children rendered in original YAML order -->
        <template v-for="childId in task.childrenIds" :key="childId">

          <!-- Simple field (no children) -->
          <template v-if="!taskStore.taskById(childId).childrenIds?.length">
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
                  <nldd-button :inert="readonly || undefined" v-if="
                    canUserCreateInstances(childId) &&
                    hasMoreThanOneInstance(childId, props.instanceId)
                  " variant="destructive" start-icon="trash" text="Verwijder veld" @click="handleDelete(childInstanceId)"></nldd-button>
                </div>
              </div>

              <!-- Add button for repeatable field -->
              <template v-if="canUserCreateInstances(childId)">
                <nldd-button :inert="readonly || undefined" variant="accent-transparent" start-icon="plus"
                  :text="`Voeg extra ${taskStore.taskById(childId).item_name || getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                  @click="taskStore.addRepeatableTaskInstance(childId, instanceId)"></nldd-button>
                <nldd-spacer size="16"></nldd-spacer>
              </template>
            </template>
          </template>

          <!-- Complex task group (has children) -->
          <template v-else>
            <template v-if="!taskStore.taskById(childId).repeatable">
              <!-- Non-repeatable task groups -->
              <template v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
                :key="`complex-nonrep-${childInstanceId}`">
                <div v-if="shouldShowTask(childId, childInstanceId)">
                  <TaskGroup :taskId="childId" :instanceId="childInstanceId" />
                </div>
              </template>
            </template>
            <template v-else>
              <!-- Repeatable task groups -->
              <div v-for="childInstanceId in taskStore.getInstanceIdsForTask(childId, props.instanceId)"
                :key="`complex-rep-${childInstanceId}`">
                <div v-if="shouldShowTask(childId, childInstanceId)" class="task-fieldset__repeatable">
                  <nldd-box :background="boxBackground">
                    <nldd-container padding="16">
                      <TaskGroup :taskId="childId" :instanceId="childInstanceId" nested-in-box />
                    </nldd-container>
                  </nldd-box>
                </div>
              </div>

              <!-- Add button for repeatable task group (outside the loop) -->
              <nldd-box v-if="canUserCreateInstances(childId) && hasVisibleInstance(childId)"
                :background="boxBackground">
                <nldd-container padding="16">
                  <nldd-button :inert="readonly || undefined" variant="accent-transparent" start-icon="plus"
                    :text="`Voeg extra ${taskStore.taskById(childId).item_name || getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                    @click="taskStore.addRepeatableTaskInstance(childId, instanceId)"></nldd-button>
                </nldd-container>
              </nldd-box>
            </template>
          </template>

        </template>
        </template>
      </div>

      <ConfirmDeleteDialog v-if="pendingDelete" :open="true" :label="pendingDelete.label"
        :summary="pendingDelete.summary" @confirm="confirmPendingDelete" @cancel="cancelPendingDelete" />

      <!-- Button to delete the current task group instance (only shown for the parent component) -->
      <nldd-button :inert="readonly || undefined" v-if="isRepeatable && canUserCreateInstances(taskId) && hasMoreThanOneInstance(taskId)"
        variant="destructive" start-icon="trash"
        :text="`Verwijder ${task.item_name || getPlainTextWithoutDefinitions(task.task.toLowerCase())}`"
        @click="handleDelete(props.instanceId)"></nldd-button>
    </fieldset>
  </div>
</template>

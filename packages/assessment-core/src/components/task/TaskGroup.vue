<script setup lang="ts">
import FormField from './FormField.vue'
import UiButton from '../ui/UiButton.vue'
import ConfirmDeleteDialog from '../ConfirmDeleteDialog.vue'
import { getPlainTextWithoutDefinitions } from '../../utils/stripHtml'
import { useTaskDependencies } from '../../composables/useTaskDependencies'
import { useTaskStore, type FlatTask, type TaskInstance } from '../../stores/tasks'
import { useAnswerStore } from '../../stores/answers'
import { usePrefixQuestionIds } from '../../composables/usePrefixQuestionIds'
import { renderInstanceLabel } from '../../utils/taskUtils'
import { findImpactedByDelete, summariseImpact, type ImpactSummary } from '../../utils/impactedAnswers'
import { computed, nextTick, ref } from 'vue'

const props = defineProps<{
  taskId: string
  instanceId: string
}>()

const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const { shouldShowTask, canUserCreateInstances, syncInstances} = useTaskDependencies()
const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))
const isRepeatable = computed(() => task.value.repeatable === true)

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
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset
      class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset rvo-margin-block-start--xs rvo-margin-inline-start--xs"
      :aria-labelledby="`group-${taskId}-${instanceId}-legend`">
      <legend
        :class="isNestedGroup && prefixQuestionIds
          ? 'rvo-label rvo-margin-block-end--xs'
          : 'utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend'"
        :id="`group-${taskId}-${instanceId}-legend`" v-html="instanceLabel"></legend>

      <!-- Group-level description: an IAMA addition (gated on prefixQuestionIds, which only
           IAMA sets). DPIA/pre-scan never showed group descriptions, so keep them hidden there. -->
      <div v-if="task.description && prefixQuestionIds" class="utrecht-form-field-description rvo-margin-block-end--sm"
        v-html="task.description"></div>

      <div role="group" :aria-labelledby="`group-${taskId}-${instanceId}-legend`"
        class="utrecht-form-field utrecht-form-field--text rvo-form-field">
        <div v-if="missingSourceMessage" class="rvo-alert rvo-alert--warning rvo-alert--padding-sm">
          <div class="rvo-alert__container">
            <span class="utrecht-icon rvo-icon rvo-icon-waarschuwing rvo-icon--xl rvo-status-icon-waarschuwing"
              role="img" aria-label="Waarschuwing"></span>
            <div class="rvo-alert-text">{{ missingSourceMessage }}</div>
          </div>
        </div>
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
                  <UiButton v-if="
                    canUserCreateInstances(childId) &&
                    hasMoreThanOneInstance(childId, props.instanceId)
                  " variant="warning" icon="verwijderen" label="Verwijder veld" @click="handleDelete(childInstanceId)" />
                </div>
              </div>

              <!-- Add button for repeatable field -->
              <div v-if="canUserCreateInstances(childId)" class="rvo-layout-margin-vertical--md">
                <UiButton variant="tertiary" icon="plus"
                  :label="`Voeg extra ${taskStore.taskById(childId).item_name || getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                  @click="taskStore.addRepeatableTaskInstance(childId, instanceId)" />
              </div>
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
                <div v-if="shouldShowTask(childId, childInstanceId)" class="rvo-margin-block-end--md">
                  <TaskGroup :taskId="childId" :instanceId="childInstanceId"
                    class="rvo-margin-block-end--md background-grijs-200" />
                </div>
              </div>

              <!-- Add button for repeatable task group (outside the loop) -->
              <div v-if="canUserCreateInstances(childId) && hasVisibleInstance(childId)"
                class="rvo-card background-grijs-200 rvo-padding-block-start--xs rvo-padding-block-end--xs">
                <UiButton variant="tertiary" icon="plus"
                  :label="`Voeg extra ${taskStore.taskById(childId).item_name || getPlainTextWithoutDefinitions(taskStore.taskById(childId).task.toLowerCase())} toe`"
                  @click="taskStore.addRepeatableTaskInstance(childId, instanceId)" />
              </div>
            </template>
          </template>

        </template>
        </template>
      </div>

      <ConfirmDeleteDialog v-if="pendingDelete" :open="true" :label="pendingDelete.label"
        :summary="pendingDelete.summary" @confirm="confirmPendingDelete" @cancel="cancelPendingDelete" />

      <!-- Button to delete the current task group instance (only shown for the parent component) -->
      <UiButton v-if="isRepeatable && canUserCreateInstances(taskId) && hasMoreThanOneInstance(taskId)"
        variant="warning" icon="verwijderen"
        :label="`Verwijder ${task.item_name || getPlainTextWithoutDefinitions(task.task.toLowerCase())}`"
        @click="handleDelete(props.instanceId)" />
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import ActionPointsOverview from '../ActionPointsOverview.vue'
import TaskGroup from './TaskGroup.vue'
import TaskItem from './TaskItem.vue'
import UiAccordion from '../ui/UiAccordion.vue'
import Results from '../Results.vue'
import PreScanPreview from '../PreScanPreview.vue'
import '@nldd/design-system/banner'
import '@nldd/design-system/box'
import '@nldd/design-system/button'
import '@nldd/design-system/container'
import '@nldd/design-system/title'
import { FormType } from '../../models/dpia'
import { getPlainTextWithoutDefinitions } from '../../utils/stripHtml'
import { useTaskDependencies } from '../../composables/useTaskDependencies'
import { type FlatTask, taskIsOfTaskType, useTaskStore } from '../../stores/tasks'
import { computed } from 'vue'
import risicoMatrixImage from '../../../../../sources/assets/risico_matrix.png'
import stroomschemaIamaV2Image from '../../../../../sources/assets/stroomschema_iama_v2.png'

const props = defineProps<{
  taskId: string
}>()

const taskStore = useTaskStore()

const { shouldShowTask, canUserCreateInstances, hasSourceTaskValues, getDependencySourceTaskId } = useTaskDependencies()

const task = computed<FlatTask>(() => taskStore.taskById(props.taskId))

const shouldShowChildren = computed(
  () => taskIsOfTaskType(task.value, 'task_group') && (task.value.childrenIds?.length || 0) > 0,
)

const isInfoOnlyChild = (childId: string): boolean => {
  const child = taskStore.taskById(childId)
  return taskIsOfTaskType(child, 'task_group') && child.childrenIds.length === 0 && !!child.description
}

type ChildGroup =
  | { type: 'accordion'; ids: string[] }
  | { type: 'single'; id: string }

const childGroups = computed<ChildGroup[]>(() => {
  const ids = task.value.childrenIds || []
  const groups: ChildGroup[] = []
  let accordionRun: string[] = []
  for (const childId of ids) {
    if (shouldSkipTask(childId)) continue
    if (isInfoOnlyChild(childId)) {
      accordionRun.push(childId)
    } else {
      if (accordionRun.length) {
        groups.push({ type: 'accordion', ids: accordionRun })
        accordionRun = []
      }
      groups.push({ type: 'single', id: childId })
    }
  }
  if (accordionRun.length) groups.push({ type: 'accordion', ids: accordionRun })
  return groups
})

const isSigningTask = computed(() => taskIsOfTaskType(task.value, 'signing'))

const isInformationalTask = computed(() => taskIsOfTaskType(task.value, 'informational'))

const firstAccordionChildId = computed<string | null>(() => {
  const firstAccordion = childGroups.value.find((g): g is { type: 'accordion'; ids: string[] } => g.type === 'accordion')
  return firstAccordion?.ids[0] ?? null
})

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
  const shouldSkipIdPrefix = !task.is_official_id || (task.type && task.type.includes('signing'));
  return shouldSkipIdPrefix
    ? task.task
    : `${task.id}. ${task.task}`;
}

const missingSourceDependencies = computed(() => {
  if (!task.value.childrenIds) return []

  const dependencies: Array<{ childId: string; sourceId: string; sectionNumber: string; sectionName: string; hasOfficialId: boolean }> = []

  // Recursively collect all descendant task IDs, including intermediate
  // task groups. Leaf-only collection would miss dependencies declared on
  // repeatable parents (e.g. 7.1 depends on 6.1.1.1 via sync_instances),
  // causing no warning to appear even when the source is unfilled.
  function collectDescendants(taskId: string): string[] {
    const t = taskStore.taskById(taskId)
    const result: string[] = [taskId]
    if (t.childrenIds) {
      for (const childId of t.childrenIds) {
        result.push(...collectDescendants(childId))
      }
    }
    return result
  }

  // Resolve a task's root section id by climbing parentId. Robust to both
  // integer root ids ("7") and dotted root ids ("1.0", as used by IAMA) —
  // a naive sourceId.split('.')[0] would yield "1" for an IAMA "1.0" root,
  // which never matches props.taskId and then crashed on taskById("1").
  function resolveRootSectionId(taskId: string): string {
    let current = taskStore.getTaskByIdFromNamespace(taskStore.activeNamespace, taskId)
    if (!current) return taskId.split('.')[0]
    while (current.parentId) {
      const parent = taskStore.getTaskByIdFromNamespace(taskStore.activeNamespace, current.parentId)
      if (!parent) break
      current = parent
    }
    return current.id
  }

  const allDescendantIds = task.value.childrenIds.flatMap(id => collectDescendants(id))

  for (const descendantId of allDescendantIds) {
    const descendantTask = taskStore.taskById(descendantId)
    const sourceId = getDependencySourceTaskId.value(descendantTask)

    if (sourceId) {
      const sourceStatus = hasSourceTaskValues.value(descendantTask)

      if (!sourceStatus.hasValues) {
        const mainSectionId = resolveRootSectionId(sourceId)

        // Skip dependencies that point to the current section (same root task)
        if (mainSectionId === props.taskId) continue

        const mainTask = taskStore.getTaskByIdFromNamespace(taskStore.activeNamespace, mainSectionId)
        const mainTaskHeader = mainTask ? mainTask.task : mainSectionId
        const hasOfficialId = mainTask?.is_official_id === true

        dependencies.push({
          childId: descendantId,
          sourceId,
          sectionNumber: mainSectionId,
          sectionName: mainTaskHeader,
          hasOfficialId,
        })
      }
    }
  }

  // Return unique dependencies by section number
  return dependencies.filter((dep, index, self) =>
    index === self.findIndex(d => d.sectionNumber === dep.sectionNumber)
  )
})

// Section-wide flag (data-driven via action_point_summary): the action-points
// overview renders once at the bottom of the section, after all subsections.
const showActiepuntenOverview = computed(() => task.value.action_point_summary === true)

const imageMap = {
  'risico_matrix.png': risicoMatrixImage,
  'stroomschema_iama_v2.png': stroomschemaIamaV2Image,
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
  <div class="task-section">
    <!-- Task header -->
    <h1>{{ taskDisplayTitle(task) }}</h1>

    <nldd-container v-if="isSigningTask" gap="32">
      <div v-if="task.description" class="task-section__description">
        <p class="preserve-whitespace" v-html="task.description"></p>
      </div>

      <Results v-if="activeNamespace === FormType.PRE_SCAN" />
    </nldd-container>

    <nldd-container v-else gap="32">

      <!-- Show consolidated warnings for tasks that need to be filled in -->
      <nldd-banner v-if="missingSourceDependencies.length > 0" variant="warning"
        text="Voor deze sectie is het nodig eerst de volgende secties in te vullen:">
        <ul class="task-section__dependency-list">
          <li v-for="dep in missingSourceDependencies" :key="dep.sourceId">
            <template v-if="dep.hasOfficialId">Sectie {{ dep.sectionNumber }}: </template>{{ dep.sectionName }}
          </li>
        </ul>
      </nldd-banner>

      <!-- Description section (if available) -->
      <div v-if="task.description" class="task-section__description">
        <p class="preserve-whitespace" v-html="task.description"></p>
        <template v-if="task.sources">
          <template v-for="source in task.sources" :key="source">
            <img v-if="source.source && source.source in imageMap" :src="getImage(source.source)"
              :alt="source.description" class="task-section__source-image" />
          </template>
        </template>
      </div>

      <PreScanPreview v-if="shouldShowPreScanPreview" :dpiaTaskId="task.id" />

      <!-- If task is a task group and it has child tasks, show the child tasks -->
      <nldd-container v-if="shouldShowChildren" gap="32">
        <template v-for="(group, groupIdx) in childGroups" :key="groupIdx">
          <!-- Run of consecutive info-only children: render as a single accordion group -->
          <div v-if="group.type === 'accordion'" class="task-section__accordions">
            <UiAccordion v-for="childId in group.ids" :key="childId"
              :open="isInformationalTask && childId === firstAccordionChildId">
              <template #title>
                <nldd-title size="5">
                  <h3>{{ taskStore.taskById(childId).task }}</h3>
                </nldd-title>
              </template>
              <p class="preserve-whitespace" v-html="taskStore.taskById(childId).description"></p>
              <template v-if="taskStore.taskById(childId).sources">
                <template v-for="source in taskStore.taskById(childId).sources" :key="source.source">
                  <img v-if="source.source && source.source in imageMap" :src="getImage(source.source)"
                    :alt="source.description" class="task-section__source-image" />
                </template>
              </template>
            </UiAccordion>
          </div>

          <template v-else>
            <template v-for="instanceId in taskStore.getInstanceIdsForTask(group.id)" :key="instanceId">
              <template v-if="shouldShowTask(group.id, instanceId)">
                <!-- One question per box: nldd-box is the design system's way of
                     marking off a region that belongs together, and the tint
                     makes the question boundaries scannable in a long section. -->
                <nldd-box>
                  <nldd-container padding="16">
                    <!--Single task (no children): render the task itself -->
                    <TaskItem v-if="!taskStore.taskById(group.id).childrenIds.length" :taskId="group.id"
                      :instanceId="instanceId" :showDescription="true" />

                    <!-- Nested task group (has children): render children as TaskGroup -->
                    <template v-else>
                      <TaskGroup :taskId="group.id" :instanceId="instanceId" />
                    </template>
                  </nldd-container>
                </nldd-box>
              </template>
            </template>

            <nldd-box v-if="isRepeatable(group.id) && canUserCreateInstances(group.id)">
              <nldd-container padding="16">
                <nldd-button variant="accent-transparent" start-icon="plus"
                  :text="`Voeg extra ${taskStore.taskById(group.id).item_name || getPlainTextWithoutDefinitions(taskStore.taskById(group.id).task.toLowerCase())} toe`"
                  @click="handleAddRepeatableTask(group.id)"></nldd-button>
              </nldd-container>
            </nldd-box>
          </template>
        </template>

        <!-- Actiepunten-samenvatting: onderaan de sectie, na alle subsecties -->
        <ActionPointsOverview v-if="showActiepuntenOverview" />
      </nldd-container>

      <!-- Single task: render the task itself, in the same box as the
           questions of a grouped section. -->
      <nldd-box v-else-if="!taskIsOfTaskType(task, 'task_group')">
        <nldd-container padding="16">
          <TaskItem :taskId="taskId" :instanceId="taskStore.getInstanceIdsForTask(taskId)[0] || ''" />
        </nldd-container>
      </nldd-box>
    </nldd-container>
  </div>
</template>

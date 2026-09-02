<script setup lang="ts">
import { computed, inject } from 'vue'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { type FlatTask, useTaskStore, taskIsOfTaskType } from '../stores/tasks'
import { useAnswerStore } from '../stores/answers'
import { PERSISTENCE_KEY } from '../persistence'
import '@nldd/design-system/icon-cell'
import '@nldd/design-system/list'
import '@nldd/design-system/list-item'
import '@nldd/design-system/text'
import '@nldd/design-system/text-cell'

const props = withDefaults(defineProps<{
  disabled?: boolean
  navigable?: boolean
  // Root task ids with unresolved comments (boekhouding only; the standalone
  // has no comments and simply passes nothing).
  commentedTaskIds?: string[]
}>(), {
  commentedTaskIds: () => [],
})

const taskStore = useTaskStore()
const answerStore = useAnswerStore()
const { currentRootTaskId, rootTasks, goToTask: rawGoToTask } = useTaskNavigation()
const persistence = inject(PERSISTENCE_KEY)

const isNavigable = computed(() => !props.disabled && props.navigable === true)

const goToTask = (taskId: string | null) => {
  if (!isNavigable.value || taskId === null) return
  if (persistence?.flushSave) persistence.flushSave()
  rawGoToTask(taskId)
}

// Split: regular tasks vs conclusion task (type includes 'signing')
const regularTasks = computed(() =>
  rootTasks.value.filter(t => !t.type?.includes('signing'))
)
const conclusionTask = computed(() =>
  rootTasks.value.find(t => t.type?.includes('signing'))
)

function isInformational(task: FlatTask): boolean {
  return taskIsOfTaskType(task, 'informational')
}

// The number lives in a muted, tabular span before the title. Informational,
// signing and non-official-id steps carry no number (same rule as the title).
function stepParts(task: FlatTask): { num: string | null; title: string } {
  const skipNum = !task.is_official_id || (task.type && (task.type.includes('signing') || task.type.includes('informational')))
  return skipNum ? { num: null, title: task.task } : { num: String(task.id), title: task.task }
}

function isNonEmpty(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

// Root task ids that already have at least one non-empty answer somewhere in
// their subtree. Answer keys are "<rootId>.<...>", so the first segment is the
// root task id (repeatable instance keys share that prefix).
const answeredRoots = computed(() => {
  const map = answerStore.answers[taskStore.activeNamespace]
  const roots = new Set<string>()
  for (const key in map) {
    if (isNonEmpty(map[key].value)) roots.add(key.split('.')[0])
  }
  return roots
})

type Node = 'done' | 'current' | 'progress' | 'open'
interface Step {
  key: string
  id: string | null
  title: string
  label: string
  node: Node
  current: boolean
  done: boolean
  comment: boolean
  // The marker always carries the chapter number; its fill carries the state
  // (done, current, started, untouched).
  markerText: string | null
  navigable: boolean
}

function describe(task: FlatTask): Step {
  const { num, title } = stepParts(task)
  // While the form is still disabled (preview before start) nothing reads as
  // done, in-progress or current - it is a plain, muted outline.
  const done = !props.disabled && !isInformational(task) && taskStore.isRootTaskCompleted(task.id)
  const current = !props.disabled && task.id === currentRootTaskId.value
  const progress = !props.disabled && !done && !current && answeredRoots.value.has(task.id)
  const node: Node = done ? 'done' : current ? 'current' : progress ? 'progress' : 'open'
  return {
    key: task.id,
    id: task.id,
    title,
    // Number and title on one line: as an overline it would cost a second line
    // per row, and the DPIA already runs to 22 chapters.
    label: num ? `${num}. ${title}` : title,
    node,
    current,
    done,
    comment: props.commentedTaskIds.includes(task.id),
    markerText: num,
    navigable: isNavigable.value,
  }
}

const steps = computed<Step[]>(() => {
  const out = regularTasks.value.map(describe)
  if (conclusionTask.value) {
    out.push(describe(conclusionTask.value))
  } else {
    out.push({
      key: '__end__', id: null, title: 'Proces voltooid', label: 'Proces voltooid',
      node: 'open', current: false, done: false, comment: false,
      markerText: null, navigable: false,
    })
  }
  return out
})
</script>

<template>
  <div class="progress-tracker">
    <nldd-text class="progress-tracker__title" weight="bold">Inhoudsopgave</nldd-text>
    <!-- A plain list: nldd-list owns hover, focus and arrow-key navigation, and
         the row carries its own state. The chapter number rides along as the
         cell's overline; a check mark at the end says the step is done. -->
    <nldd-list variant="simple" dividers="never" accessible-label="Inhoudsopgave">
      <nldd-list-item v-for="step in steps" :key="step.key"
        class="toc-item" :class="`toc-item--${step.node}`"
        :button="step.navigable || undefined"
        :current="step.current || undefined"
        @click="goToTask(step.id)">
        <nldd-text-cell class="toc-title" :text="step.label"></nldd-text-cell>
        <nldd-icon-cell v-if="step.comment" class="toc-comment"
          icon="comment" size="16" color="accent"></nldd-icon-cell>
        <nldd-icon-cell v-if="step.done" class="toc-done"
          icon="check-mark" size="16" color="success"></nldd-icon-cell>
        <!-- Started but not finished: a small filled dot, the state the
             timeline marker used to carry in its core. -->
        <nldd-icon-cell v-else-if="step.node === 'progress'" class="toc-progress"
          icon="circle-filled-small" size="16" color="accent"></nldd-icon-cell>
        <span v-if="step.done" class="sr-only">, voltooid</span>
        <span v-if="step.node === 'progress'" class="sr-only">, deels ingevuld</span>
        <span v-if="step.comment" class="sr-only">, bevat opmerkingen</span>
      </nldd-list-item>
    </nldd-list>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useTaskNavigation } from '../composables/useTaskNavigation'
import { type FlatTask, useTaskStore, taskIsOfTaskType } from '../stores/tasks'
import { useAnswerStore } from '../stores/answers'
import { PERSISTENCE_KEY } from '../persistence'
import '@nldd/design-system/icon-cell'
import '@nldd/design-system/list'
import '@nldd/design-system/list-item'
import '@nldd/design-system/spacer-cell'
import '@nldd/design-system/text-cell'
import '@nldd/design-system/timeline-track-cell'

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
  node: Node
  current: boolean
  done: boolean
  comment: boolean
  status: 'past' | 'current' | 'future'
  // The step marker encodes the state: a check mark when done, a small core
  // when started (slot), the chapter number otherwise.
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
    node,
    current,
    done,
    comment: props.commentedTaskIds.includes(task.id),
    status: done ? 'past' : current ? 'current' : 'future',
    markerText: node === 'progress' ? null : num,
    navigable: isNavigable.value,
  }
}

const steps = computed<Step[]>(() => {
  const out = regularTasks.value.map(describe)
  if (conclusionTask.value) {
    out.push(describe(conclusionTask.value))
  } else {
    out.push({
      key: '__end__', id: null, title: 'Proces voltooid',
      node: 'open', current: false, done: false, comment: false,
      status: 'future', markerText: null, navigable: false,
    })
  }
  return out
})

function positionOf(index: number): 'only' | 'first' | 'between' | 'last' {
  if (steps.value.length === 1) return 'only'
  if (index === 0) return 'first'
  if (index === steps.value.length - 1) return 'last'
  return 'between'
}
</script>

<template>
  <div class="progress-tracker">
    <div class="progress-tracker__title">Inhoudsopgave</div>
    <!-- nldd-list owns the row: hover, focus, the current marker and arrow-key
         navigation. dividers="never" keeps the timeline the only vertical line. -->
    <nldd-list variant="simple" dividers="never" accessible-label="Inhoudsopgave">
      <nldd-list-item v-for="(step, i) in steps" :key="step.key"
        class="toc-item" :class="`toc-item--${step.node}`"
        :button="step.navigable || undefined"
        :current="step.current || undefined"
        @click="goToTask(step.id)">
        <nldd-timeline-track-cell class="toc-track-cell" variant="step"
          :status="step.status" :position="positionOf(i)"
          :text="step.markerText">
          <span v-if="step.node === 'progress'" class="toc-progress-core"></span>
        </nldd-timeline-track-cell>
        <nldd-spacer-cell size="12"></nldd-spacer-cell>
        <nldd-text-cell class="toc-title" :text="step.title"></nldd-text-cell>
        <nldd-icon-cell v-if="step.done" class="toc-done"
          icon="check-mark" size="16" color="success"></nldd-icon-cell>
        <nldd-icon-cell v-if="step.comment" class="toc-comment"
          icon="comment" size="16" color="accent"></nldd-icon-cell>
        <span v-if="step.done" class="sr-only">, voltooid</span>
        <span v-if="step.node === 'progress'" class="sr-only">, deels ingevuld</span>
        <span v-if="step.comment" class="sr-only">, bevat opmerkingen</span>
      </nldd-list-item>
    </nldd-list>
  </div>
</template>

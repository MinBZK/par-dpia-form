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
import '@nldd/design-system/text'
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
  label: string
  node: Node
  current: boolean
  done: boolean
  comment: boolean
  // The marker always carries the chapter number; its fill carries the state
  // (done, current, started, untouched).
  markerText: string | null
  // What the marker draws: a check for a finished step, a filled dot for one
  // someone has worked in, nothing for the rest.
  markerIcon: string | undefined
  // The state in words, under the title, only where nothing else says it. The
  // check mark carries done and the tinted row carries current, so the one that
  // is left is a chapter someone has begun. An untouched one says nothing:
  // "nog niet begonnen" under every other chapter is noise.
  stateLabel: string | undefined
  // What the track draws in the dot: the same three values nldd-step-indicator
  // uses. A started-but-unfinished step is 'future' with a filled core.
  status: 'past' | 'current' | 'future'
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
    markerIcon: done ? 'check-mark' : progress ? 'circle-filled-small' : undefined,
    stateLabel: !done && !current && progress ? 'Mee bezig' : undefined,
    // 'past' fills the marker from the track colour, which is what a finished
    // step should look like. It would normally darken the line above it too,
    // but line="none" on the cell keeps both halves pale, so the track stays
    // one colour whatever order the chapters are finished in.
    status: done ? 'past' : current ? 'current' : 'future',
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
      markerText: null, markerIcon: undefined, stateLabel: undefined,
      status: 'future', navigable: false,
    })
  }
  return out
})

// Where the line runs: above the dot, below it, or both. A single step gets a
// line on neither side — a track of one dot leads nowhere.
function positionOf(index: number): 'only' | 'first' | 'between' | 'last' {
  if (steps.value.length === 1) return 'only'
  if (index === 0) return 'first'
  if (index === steps.value.length - 1) return 'last'
  return 'between'
}
</script>

<template>
  <div class="progress-tracker">
    <nldd-text class="progress-tracker__title" weight="bold">Inhoudsopgave</nldd-text>
    <!-- nldd-list owns the row: hover, focus, the current marker and arrow-key
         navigation. dividers="never" keeps the timeline the only vertical line.
         The chapter number rides in the dot, so the title stands on its own. -->
    <nldd-list variant="simple" dividers="never" accessible-label="Inhoudsopgave">
      <!-- `selected`, not `current`: both mark the row, but current takes the
           highlighted fill (a dark bar) while focus is in it, which buries the
           marker and the line under it. Selected is a light tint that leaves
           both readable. Neither sets aria-current in a list that is not a
           `navigation` parent, so the state is announced below instead. -->
      <nldd-list-item v-for="(step, i) in steps" :key="step.key"
        class="toc-item" :class="`toc-item--${step.node}`"
        :button="step.navigable || undefined"
        :selected="step.current || undefined"
        @click="goToTask(step.id)">
        <!-- The marker carries the state, the number rides with the title:
             a finished step shows a check mark instead of its number, which is
             the one thing a number cannot say. -->
        <!-- line="none": no half of the track counts as covered, so the line
             is one colour the whole way down. A table of contents can be
             finished in any order, and the design system's default would paint
             dark stretches between arbitrary chapters. The markers carry the
             state. -->
        <nldd-timeline-track-cell class="toc-track-cell" variant="major" size="md" line="none"
          :status="step.status" :position="positionOf(i)"
          :icon="step.markerIcon"></nldd-timeline-track-cell>
        <nldd-spacer-cell size="12"></nldd-spacer-cell>
        <!-- The state in words under the title: an icon in a dot asks to be
             decoded, and this reads the same for everyone. It replaces the
             screen-reader-only spans that used to say it. -->
        <nldd-text-cell class="toc-title" :text="step.label"
          :supporting-text="step.stateLabel"></nldd-text-cell>
        <nldd-icon-cell v-if="step.comment" class="toc-comment"
          icon="comment" size="16" color="accent"></nldd-icon-cell>
        <!-- What only a colour or an icon says on screen still has to be said
             out loud: this list is not a `navigation` parent, so nldd-list-item
             sets no aria-current either. -->
        <span v-if="step.current" class="sr-only">, huidige stap</span>
        <span v-if="step.done" class="sr-only">, voltooid</span>
        <span v-if="step.comment" class="sr-only">, bevat opmerkingen</span>
      </nldd-list-item>
    </nldd-list>
  </div>
</template>

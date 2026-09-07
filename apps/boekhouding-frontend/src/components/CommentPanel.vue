<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import { getPlainTextWithoutDefinitions, useTaskNavigation, useTaskStore } from '@overheid-assessment/core'
import type { CommentThread } from '../api'
import '@nldd/design-system/button'
import '@nldd/design-system/inline-dialog'
import '@nldd/design-system/card'
import '@nldd/design-system/top-title-bar'
import '@nldd/design-system/toggle-button'
import '@nldd/design-system/text'
import '@nldd/design-system/container'
import '@nldd/design-system/button-group'
import '@nldd/design-system/multi-line-text-field'

const props = defineProps<{
  role: string
  activeFieldId?: string | null
  formContainerRef?: HTMLElement | null
}>()

const emit = defineEmits<{ close: []; 'deactivate-field': [] }>()

const commentStore = useCollaborationStore()
// currentRootTaskId on the store is keyed by namespace; this composable is the
// accessor that resolves it, the same one Form uses.
const taskStore = useTaskStore()
const { currentRootTaskId, rootTasks, goToTask } = useTaskNavigation()
const rootIds = computed(() => new Set(rootTasks.value.map(t => t.id)))

const showResolved = ref(false)

// nldd-toggle-button reports the new state in the change detail.
const handleResolvedToggle = (event: Event) => {
  const selected = (event as CustomEvent<{ selected?: boolean }>).detail?.selected
  if (selected !== undefined) showResolved.value = selected
}

// nldd-toggle-button reports the new state in the change detail.
const handleShowAllToggle = (event: Event) => {
  const selected = (event as CustomEvent<{ selected?: boolean }>).detail?.selected
  if (selected !== undefined) showAll.value = selected
}

const panelBodyRef = ref<HTMLElement | null>(null)

// New comment state
const newCommentBody = ref('')

// Reply state
const replyingTo = ref<string | null>(null)
const replyBody = ref('')

// Edit state
const editingId = ref<string | null>(null)
const editBody = ref('')

const canComment = computed(() =>
  props.role === 'commenter' || props.role === 'editor' || props.role === 'owner',
)

const canResolve = computed(() =>
  props.role === 'editor' || props.role === 'owner',
)

const fieldLabels = ref(new Map<string, string>())
let formObserver: MutationObserver | null = null
let updateTimer: ReturnType<typeof setTimeout> | null = null

// Only the question text, to head each group. The panel no longer lines its
// comments up with the fields, so nothing here measures geometry.
function updateFieldLabels() {
  const formEl = props.formContainerRef
  if (!formEl) return

  const labels = new Map<string, string>()
  for (const label of formEl.querySelectorAll<HTMLElement>('[id^="label-"]')) {
    const parts = label.id.replace('label-', '').split('-')
    if (parts.length < 2) continue
    const fieldId = parts.slice(1).join('-')
    // The question itself, without the explanation panels a defined term
    // carries: those are hidden on screen but sit in the label's textContent,
    // so a whole definition would bury the question under it. Read from the
    // label element itself — it carries the id, and .form-field__label is its
    // parent rather than a descendant.
    const text = getPlainTextWithoutDefinitions(label.innerHTML)
      .replace(/\s+/g, ' ')
      .trim()
    labels.set(fieldId, text || fieldId)
  }

  fieldLabels.value = labels
}

function scheduleLabelUpdate() {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => updateFieldLabels(), 50)
}

// A thread you are writing in must not vanish when a colleague resolves it mid-sentence: that
// would take the draft with it. It stays until you close what you had open.
function hasOpenInput(thread: CommentThread): boolean {
  return replyingTo.value === thread.id
    || editingId.value === thread.id
    || thread.replies.some(r => r.id === editingId.value)
}

// The chapter a field belongs to, walked up the real parent chain. Task ids are
// display numbers, not a hierarchy: the IAMA's second chapter is "1.0" and holds
// 1.1 and 1.actiepunten, so neither the first dot-segment nor a prefix match
// gets it right. A field id can carry a repeat index ("2.1.3[0]"), which the
// task itself does not have.
function rootTaskIdOf(fieldId: string): string {
  const base = fieldId.startsWith('completed.') ? fieldId.slice('completed.'.length) : fieldId
  const taskId = base.split('[')[0]

  let current = taskId
  const guard = new Set<string>()
  for (;;) {
    const parent = taskStore.getParentTaskId(current)
    if (!parent || guard.has(parent)) break
    guard.add(parent)
    current = parent
  }
  if (rootIds.value.has(current)) return current

  // Not a task we know: a completion id ("completed.3"), or the schema has not
  // loaded yet so the parent chain is still empty. Fall back to the longest root
  // id the field id starts with, and only then to its first segment.
  let best = ''
  for (const id of rootIds.value) {
    if ((taskId === id || taskId.startsWith(`${id}.`)) && id.length > best.length) best = id
  }
  return best || taskId.split('.')[0]
}

// Field ids are dotted numbers ("1.1", "2.1.3", "2.1.3[0]"), so comparing them
// segment by segment as numbers puts them in the order of the form itself.
// Anything non-numeric sorts on its text, after the numbered ones. A segment
// pads to a sortable key rather than being compared in place: the ids come from
// a map, so no two are equal and there is no tie left to break at the end.
function fieldSortKey(fieldId: string): string {
  return fieldId
    .split('.')
    .map((segment) => {
      const n = Number.parseInt(segment, 10)
      // "0" before the padded number, "1" before the text: numbers first.
      return Number.isNaN(n) ? `1${segment}` : `0${String(n).padStart(6, '0')}`
    })
    .join('.')
}

// One group per field, in the order of the form, for the chapter on screen.
// Scoped to the chapter because that is the unit the form works in: you fill in
// one step at a time, and the dots in the table of contents say where else
// something is waiting.
type Entry = { fieldId: string; threads: CommentThread[] }

// The visible groups for one chapter, in the order of the form.
function entriesForRoot(root: string): Entry[] {
  const result: Entry[] = []
  const seen = new Set<string>()

  for (const [fieldId, fieldThreads] of commentStore.threadsByField) {
    if (rootTaskIdOf(fieldId) !== root) continue
    seen.add(fieldId)

    const visible = showResolved.value
      ? fieldThreads
      : fieldThreads.filter(t => !t.resolvedAt || hasOpenInput(t))

    if (visible.length > 0 || fieldId === props.activeFieldId) {
      result.push({ fieldId, threads: visible })
    }
  }

  // Active field with no existing comments: the empty group is where the new
  // comment gets typed.
  if (props.activeFieldId && !seen.has(props.activeFieldId)
    && rootTaskIdOf(props.activeFieldId) === root) {
    result.push({ fieldId: props.activeFieldId, threads: [] })
  }

  result.sort((a, b) => fieldSortKey(a.fieldId).localeCompare(fieldSortKey(b.fieldId)))
  return result
}

// showAll widens the same list to the whole form rather than opening a second
// one beside it. Where the panel was opened from decides how it starts: the
// badge in the header counts the whole assessment, so clicking a "3" and being
// shown one comment reads as a bug; the button at a question is about that
// question, so there the list opens on the step it belongs to.
const showAll = ref(!props.activeFieldId)

// Clicking a question narrows the list back to the step that question is in.
// Only on a field arriving, never on one leaving: cancelling a new comment
// clears activeFieldId too, and that must not silently widen the list.
watch(() => props.activeFieldId, (fieldId) => { if (fieldId) showAll.value = false })

// The steps the list covers, in the order of the form, each with its title so a
// list spanning more than one step says where things belong. Three widths, from
// where the panel was opened: one question (its own button), the whole form (the
// badge in the header, which counts the whole assessment), and everything in
// between is the filter's job.
const chapters = computed(() => {
  const visible = showAll.value
    ? rootTasks.value
    : rootTasks.value.filter(task => task.id === currentRootTaskId.value)
  return visible
    .map(task => ({
      id: task.id,
      title: task.task,
      entries: entriesForRoot(task.id)
        // Opened from a question and not widened: that question only.
        .filter(entry => showAll.value || !props.activeFieldId
          || entry.fieldId === props.activeFieldId),
    }))
    .filter(chapter => chapter.entries.length > 0)
})

const elsewhereCount = computed(() =>
  rootTasks.value
    .filter(task => task.id !== currentRootTaskId.value)
    .reduce((total, task) => total
      + entriesForRoot(task.id).reduce((n, e) => n + e.threads.length, 0), 0),
)

// The list is empty when this step has nothing and the filter is still on.
const entries = computed(() => chapters.value.flatMap(c => c.entries))

onMounted(() => {
  updateFieldLabels()

  if (props.formContainerRef) {
    formObserver = new MutationObserver(scheduleLabelUpdate)
    formObserver.observe(props.formContainerRef, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  formObserver?.disconnect()
  if (updateTimer) clearTimeout(updateTimer)
})

// Bring the group for the activated field into view. The list is no longer
// aligned with the form, so opening a comment from a question has to say where
// it landed: focusing the new-comment box does that by itself, and a field that
// already has comments has no box to focus, so that group is scrolled to.
watch(() => props.activeFieldId, async (fieldId) => {
  if (!fieldId) return
  newCommentBody.value = ''
  await nextTick()

  const group = panelBodyRef.value?.querySelector<HTMLElement>(
    `[data-field-group="${CSS.escape(fieldId)}"]`,
  )
  const input = group?.querySelector<HTMLElement>(
    '.comment-inline-form nldd-multi-line-text-field',
  )
  if (input && canComment.value) {
    input.focus()
    return
  }
  group?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

function scrollToField(fieldId: string) {
  const formEl = props.formContainerRef
  if (!formEl) return
  const label = formEl.querySelector<HTMLElement>(`[id$="-${CSS.escape(fieldId)}"]`)
  label?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function isOwnComment(authorId: string): boolean {
  return commentStore.currentUserId === authorId
}

function canDeleteComment(authorId: string): boolean {
  return isOwnComment(authorId) || props.role === 'owner'
}

// The store records a failed action and the editor reports it; catching here keeps the
// failure from surfacing as an unhandled rejection, and leaves what the user typed in place.
async function succeeded(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action()
    return true
  } catch {
    return false
  }
}

async function submitComment(fieldId: string) {
  const body = newCommentBody.value.trim()
  if (!body) return

  if (await succeeded(() => commentStore.createComment(fieldId, body))) {
    newCommentBody.value = ''
  }
}

async function submitReply(parentId: string, fieldId: string) {
  const body = replyBody.value.trim()
  if (!body) return

  if (await succeeded(() => commentStore.createReply(parentId, fieldId, body))) {
    replyBody.value = ''
    replyingTo.value = null
  }
}

function startReply(threadId: string) {
  replyingTo.value = threadId
  replyBody.value = ''
}

function cancelReply() {
  replyingTo.value = null
  replyBody.value = ''
}

// NLDD fields carry their value in event.detail; a plain input event falls back
// to the host's own value.
function readFieldValue(event: Event): string {
  return (event as CustomEvent).detail?.value ?? (event.target as HTMLTextAreaElement).value
}

async function startEdit(id: string, currentBody: string) {
  editingId.value = id
  editBody.value = currentBody
  await nextTick()
  const field = panelBodyRef.value?.querySelector<HTMLElement>(
    `.comment-item__edit nldd-multi-line-text-field`,
  )
  field?.focus()
}

function cancelEdit() {
  editingId.value = null
  editBody.value = ''
}

async function submitEdit() {
  if (!editingId.value || !editBody.value.trim()) return
  if (await succeeded(() => commentStore.updateComment(editingId.value!, editBody.value.trim()))) {
    editingId.value = null
    editBody.value = ''
  }
}

async function handleDelete(commentId: string) {
  await succeeded(() => commentStore.deleteComment(commentId))
}

async function handleResolve(commentId: string) {
  await succeeded(() => commentStore.resolveThread(commentId))
}

async function handleReopen(commentId: string) {
  await succeeded(() => commentStore.reopenThread(commentId))
}
</script>

<template>
  <!-- A fragment, not a wrapper: these are the direct children of the
       nldd-page inside the sheet, so the title bar reaches its `header` slot
       and the list is the page's own scrolling content. The bar renders the
       title as a real heading (the panel had none) and draws the close button
       itself. -->
  <nldd-top-title-bar slot="header" class="comment-panel__header" text="Opmerkingen"
    dismiss-text="Sluiten" @dismiss="emit('close')"></nldd-top-title-bar>

  <nldd-container class="comment-panel__body" ref="panelBodyRef"
    role="complementary" aria-label="Opmerkingen">
      <!-- Their own line under the title: beside it, even two short labels
           squeezed "Opmerkingen" down to "Opme...". Each button names the
           comments it brings into the list, so it reads as what you get rather
           than as a setting you operate. -->
      <nldd-container class="comment-panel__filters" layout="wrap" gap="4"
        vertical-alignment="center">
        <!-- Always there once the list is narrowed to one question or one step:
             it is the only way back to the whole form, and hiding it would leave
             a reader stuck on what they clicked. -->
        <nldd-toggle-button v-if="elsewhereCount > 0 || showAll || activeFieldId"
          class="comment-panel__show-all"
          type="checkbox" size="sm" icon="bullet-list" text="Alle opmerkingen"
          :selected="showAll || undefined"
          @change="handleShowAllToggle"></nldd-toggle-button>
        <nldd-toggle-button class="comment-panel__filter"
          type="checkbox" size="sm" icon="check-mark-circle" text="Opgeloste opmerkingen"
          :selected="showResolved || undefined"
          @change="handleResolvedToggle"></nldd-toggle-button>
      </nldd-container>

      <!-- Empty state -->
      <p v-if="commentStore.loading" class="comment-panel__empty" role="status">Laden...</p>
      <nldd-inline-dialog v-else-if="entries.length === 0" class="comment-panel__empty"
        icon="comment" icon-color="secondary"
        text="Nog geen opmerkingen op deze pagina"
        supporting-text="Klik op &quot;Opmerking&quot; bij een vraag om er een te plaatsen."></nldd-inline-dialog>

      <!-- One group per question, in the order of the form. With the filter off
           the list spans every step, so each gets its title above it; with one
           step there is nothing to tell apart and the heading would be noise. -->
      <template v-for="chapter in chapters" :key="chapter.id">
      <button v-if="showAll" class="comment-chapter__title" @click="goToTask(chapter.id)">
        {{ chapter.title }}
      </button>
      <div
        v-for="entry in chapter.entries"
        :key="entry.fieldId"
        :data-field-group="entry.fieldId"
        class="comment-field-group"
        :class="{ 'comment-field-group--active': activeFieldId === entry.fieldId }"
      >
        <!-- The question this belongs to, and the way back to it in the form. -->
        <button
          v-if="fieldLabels.get(entry.fieldId)"
          class="comment-field-group__label"
          @click="scrollToField(entry.fieldId)"
        >{{ fieldLabels.get(entry.fieldId) }}</button>

        <!-- Threads -->
        <nldd-card
          v-for="thread in entry.threads"
          :key="thread.id"
          class="comment-thread"
          :class="{ 'comment-thread--resolved': thread.resolvedAt }"
          :background="thread.resolvedAt ? 'tinted' : 'base'"
        >
          <nldd-container padding="12">
          <p v-if="thread.resolvedAt && hasOpenInput(thread)" class="comment-thread__resolved-label" role="status">
            Opgelost door {{ thread.resolvedByName || 'een collega' }} terwijl je hier aan het schrijven was.
          </p>

          <!-- Root comment -->
          <div class="comment-item">
            <div class="comment-item__header">
              <nldd-text class="comment-item__author" size="sm" weight="bold">{{ thread.authorName }}</nldd-text>
              <nldd-text class="comment-item__time" size="xs" color="secondary">
                <time :datetime="thread.createdAt">{{ formatDate(thread.createdAt) }}</time>
              </nldd-text>
            </div>

            <div v-if="editingId === thread.id" class="comment-item__edit">
              <nldd-multi-line-text-field
                accessible-label="Opmerking bewerken"
                rows="2"
                resize="auto"
                :value="editBody"
                @input="editBody = readFieldValue($event)"
                @keydown.enter.meta="submitEdit"
                @keydown.escape.stop="cancelEdit"
              ></nldd-multi-line-text-field>
              <nldd-button-group orientation="horizontal" class="comment-item__edit-actions" size="xs">
                <nldd-button variant="primary" text="Opslaan" @click="submitEdit"></nldd-button>
                <nldd-button variant="neutral-tinted" text="Annuleer" @click="cancelEdit"></nldd-button>
              </nldd-button-group>
            </div>
            <p
              v-else
              class="comment-item__body"
              :class="{ 'comment-item__body--editable': isOwnComment(thread.authorId) && canComment }"
              :role="isOwnComment(thread.authorId) && canComment ? 'button' : undefined"
              :tabindex="isOwnComment(thread.authorId) && canComment ? 0 : undefined"
              :aria-label="isOwnComment(thread.authorId) && canComment ? 'Opmerking bewerken' : undefined"
              @click="isOwnComment(thread.authorId) && canComment && startEdit(thread.id, thread.body)"
              @keydown.enter="isOwnComment(thread.authorId) && canComment && startEdit(thread.id, thread.body)"
            >{{ thread.body }}</p>

            <div v-if="editingId !== thread.id" class="comment-item__footer">
              <nldd-button
                v-if="canComment && !thread.resolvedAt"
                size="xs"
                variant="neutral-transparent"
                start-icon="comment"
                text="Reageren"
                @click="startReply(thread.id)"
              ></nldd-button>
              <nldd-button
                v-if="canDeleteComment(thread.authorId)"
                size="xs"
                variant="critical-transparent"
                start-icon="trash"
                text="Verwijderen"
                @click="handleDelete(thread.id)"
              ></nldd-button>
              <div class="comment-item__spacer"></div>
              <nldd-button
                v-if="canResolve && !thread.resolvedAt"
                size="xs"
                variant="accent-transparent"
                start-icon="check-mark"
                text="Oplossen"
                @click="handleResolve(thread.id)"
              ></nldd-button>
              <nldd-button
                v-if="canResolve && thread.resolvedAt"
                size="xs"
                variant="neutral-transparent"
                start-icon="undo"
                text="Heropenen"
                @click="handleReopen(thread.id)"
              ></nldd-button>
            </div>

          </div>

          <!-- Replies -->
          <div v-if="thread.replies.length > 0" class="comment-replies">
            <div v-for="reply in thread.replies" :key="reply.id" class="comment-item comment-item--reply">
              <div class="comment-item__header">
                <nldd-text class="comment-item__author" size="sm" weight="bold">{{ reply.authorName }}</nldd-text>
                <nldd-text class="comment-item__time" size="xs" color="secondary">
                  <time :datetime="reply.createdAt">{{ formatDate(reply.createdAt) }}</time>
                </nldd-text>
              </div>

              <div v-if="editingId === reply.id" class="comment-item__edit">
                <nldd-multi-line-text-field
                  accessible-label="Reactie bewerken"
                  rows="2"
                  resize="auto"
                  :value="editBody"
                  @input="editBody = readFieldValue($event)"
                  @keydown.enter.meta="submitEdit"
                  @keydown.escape.stop="cancelEdit"
                ></nldd-multi-line-text-field>
                <nldd-button-group orientation="horizontal" class="comment-item__edit-actions" size="xs">
                  <nldd-button variant="primary" text="Opslaan" @click="submitEdit"></nldd-button>
                  <nldd-button variant="neutral-tinted" text="Annuleer" @click="cancelEdit"></nldd-button>
                </nldd-button-group>
              </div>
              <p
                v-else
                class="comment-item__body"
                :class="{ 'comment-item__body--editable': isOwnComment(reply.authorId) && canComment }"
                :role="isOwnComment(reply.authorId) && canComment ? 'button' : undefined"
                :tabindex="isOwnComment(reply.authorId) && canComment ? 0 : undefined"
                :aria-label="isOwnComment(reply.authorId) && canComment ? 'Reactie bewerken' : undefined"
                @click="isOwnComment(reply.authorId) && canComment && startEdit(reply.id, reply.body)"
                @keydown.enter="isOwnComment(reply.authorId) && canComment && startEdit(reply.id, reply.body)"
              >{{ reply.body }}</p>

              <div v-if="editingId !== reply.id && canComment" class="comment-item__footer">
                <nldd-button
                  v-if="canDeleteComment(reply.authorId)"
                  size="xs"
                  variant="critical-transparent"
                  start-icon="trash"
                  text="Verwijderen"
                  @click="handleDelete(reply.id)"
                ></nldd-button>
              </div>
            </div>
          </div>

          <!-- Reply form -->
          <div v-if="replyingTo === thread.id" class="comment-reply-form">
            <nldd-multi-line-text-field
              accessible-label="Reactie schrijven"
              rows="2"
              resize="auto"
              placeholder="Schrijf een reactie..."
              :value="replyBody"
              @input="replyBody = readFieldValue($event)"
              @keydown.enter.meta="submitReply(thread.id, thread.fieldId)"
              @keydown.escape.stop="cancelReply"
            ></nldd-multi-line-text-field>
            <nldd-button-group orientation="horizontal" class="comment-reply-form__actions" size="xs">
              <nldd-button variant="primary" text="Reageer" @click="submitReply(thread.id, thread.fieldId)"></nldd-button>
              <nldd-button variant="neutral-tinted" text="Annuleer" @click="cancelReply"></nldd-button>
            </nldd-button-group>
          </div>
          </nldd-container>
        </nldd-card>

        <!-- Inline new comment form (appears when this field is active) -->
        <nldd-card v-if="activeFieldId === entry.fieldId && canComment"
          class="comment-inline-form" background="tinted">
          <nldd-container padding="12" gap="8">
            <nldd-multi-line-text-field
              accessible-label="Nieuwe opmerking schrijven"
              rows="2"
              resize="auto"
              placeholder="Schrijf een opmerking..."
              :value="newCommentBody"
              @input="newCommentBody = readFieldValue($event)"
              @keydown.enter.meta="submitComment(entry.fieldId)"
              @keydown.escape.stop="newCommentBody = ''; emit('deactivate-field')"
            ></nldd-multi-line-text-field>
            <nldd-button-group orientation="horizontal" size="xs">
              <nldd-button
                variant="primary"
                text="Plaatsen"
                :disabled="!newCommentBody.trim() || undefined"
                @click="submitComment(entry.fieldId)"
              ></nldd-button>
              <nldd-button
                variant="neutral-tinted"
                text="Annuleer"
                @click="newCommentBody = ''; emit('deactivate-field')"
              ></nldd-button>
            </nldd-button-group>
          </nldd-container>
        </nldd-card>
      </div>

      </template>

  </nldd-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import type { CommentThread } from '../api'
import '@nldd/design-system/button'
import '@nldd/design-system/card'
import '@nldd/design-system/container'
import '@nldd/design-system/icon'
import '@nldd/design-system/icon-button'
import '@nldd/design-system/multi-line-text-field'

const props = defineProps<{
  role: string
  activeFieldId?: string | null
  formContainerRef?: HTMLElement | null
}>()

const emit = defineEmits<{ close: []; 'deactivate-field': [] }>()

const commentStore = useCollaborationStore()

const showResolved = ref(false)
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

const fieldPositions = ref(new Map<string, number>())
const fieldLabels = ref(new Map<string, string>())
const groupHeights = ref(new Map<string, number>())
let formObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
const groupObserver = new ResizeObserver(() => measureGroups())
let updateTimer: ReturnType<typeof setTimeout> | null = null

function updateFieldPositions() {
  const formEl = props.formContainerRef
  const bodyEl = panelBodyRef.value
  if (!formEl || !bodyEl) return

  const bodyRect = bodyEl.getBoundingClientRect()
  const positions = new Map<string, number>()
  const labels = new Map<string, string>()

  for (const label of formEl.querySelectorAll<HTMLElement>('[id^="label-"]')) {
    const parts = label.id.replace('label-', '').split('-')
    if (parts.length < 2) continue
    const fieldId = parts.slice(1).join('-')
    positions.set(fieldId, label.getBoundingClientRect().top - bodyRect.top)
    const titleEl = label.querySelector('.form-field__label > :first-child')
    let text: string | undefined
    if (titleEl) {
      // Exclude any begrip-definition tooltip text nested in the title.
      const clone = titleEl.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.aiv-definition-text').forEach((el) => el.remove())
      text = clone.textContent?.trim()
    }
    labels.set(fieldId, text || label.textContent?.trim().split('\n')[0]?.trim() || fieldId)
  }

  fieldPositions.value = positions
  fieldLabels.value = labels
}

function schedulePositionUpdate() {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => updateFieldPositions(), 50)
}

// A thread you are writing in must not vanish when a colleague resolves it mid-sentence: that
// would take the draft with it. It stays until you close what you had open.
function hasOpenInput(thread: CommentThread): boolean {
  return replyingTo.value === thread.id
    || editingId.value === thread.id
    || thread.replies.some(r => r.id === editingId.value)
}

// Entries positioned at their field's vertical offset
const positionedEntries = computed(() => {
  const positions = fieldPositions.value
  const entries: Array<{ fieldId: string; threads: CommentThread[]; top: number }> = []
  const seen = new Set<string>()

  for (const [fieldId, fieldThreads] of commentStore.threadsByField) {
    const top = positions.get(fieldId)
    if (top === undefined) continue
    seen.add(fieldId)

    const visible = showResolved.value
      ? fieldThreads
      : fieldThreads.filter(t => !t.resolvedAt || hasOpenInput(t))

    if (visible.length > 0 || fieldId === props.activeFieldId) {
      entries.push({ fieldId, threads: visible, top })
    }
  }

  // Active field with no existing comments
  if (props.activeFieldId && !seen.has(props.activeFieldId)) {
    const top = positions.get(props.activeFieldId)
    if (top !== undefined) {
      entries.push({ fieldId: props.activeFieldId, threads: [], top })
    }
  }

  entries.sort((a, b) => a.top - b.top)
  return entries
})

// Groups are absolutely positioned at their field's offset, so a group taller than the gap to
// the next field would cover it — hiding text and action buttons. Walking top to bottom and
// keeping each group below the previous one trades exact field alignment for readability, the
// way Google Docs does. Heights are measured, so this only settles once the groups are laid
// out; moving a group does not change its height, so measuring cannot loop.
const GROUP_GAP_PX = 8

const stackedEntries = computed(() => {
  let previousBottom = Number.NEGATIVE_INFINITY

  return positionedEntries.value.map((entry) => {
    const top = Math.max(entry.top, previousBottom)
    previousBottom = top + (groupHeights.value.get(entry.fieldId) ?? 0) + GROUP_GAP_PX
    return { ...entry, top }
  })
})

// A queued resize notification can still arrive after the panel is gone, hence the guard here
// but not in observeGroups, which only ever runs while mounted.
function measureGroups() {
  const bodyEl = panelBodyRef.value
  if (!bodyEl) return

  const heights = new Map<string, number>()
  for (const el of bodyEl.querySelectorAll<HTMLElement>('[data-field-group]')) {
    heights.set(el.dataset.fieldGroup!, el.offsetHeight)
  }
  groupHeights.value = heights
}

function observeGroups() {
  groupObserver.disconnect()
  for (const el of panelBodyRef.value!.querySelectorAll<HTMLElement>('[data-field-group]')) {
    groupObserver.observe(el)
  }
}

// A group's height changes when its text reflows or an edit/reply form opens, which shifts
// everything below it.
watch(positionedEntries, async () => {
  await nextTick()
  observeGroups()
  measureGroups()
})

onMounted(() => {
  requestAnimationFrame(() => updateFieldPositions())

  observeGroups()
  measureGroups()

  if (props.formContainerRef) {
    formObserver = new MutationObserver(schedulePositionUpdate)
    formObserver.observe(props.formContainerRef, { childList: true, subtree: true })

    resizeObserver = new ResizeObserver(schedulePositionUpdate)
    resizeObserver.observe(props.formContainerRef)
  }
})

onUnmounted(() => {
  formObserver?.disconnect()
  resizeObserver?.disconnect()
  groupObserver.disconnect()
  if (updateTimer) clearTimeout(updateTimer)
})

// Focus the field when it is activated
watch(() => props.activeFieldId, async (fieldId) => {
  if (!fieldId || !canComment.value) return
  newCommentBody.value = ''
  await nextTick()
  updateFieldPositions()
  await nextTick()
  const field = panelBodyRef.value?.querySelector<HTMLElement>(
    `[data-field-group="${CSS.escape(fieldId)}"] .comment-inline-form nldd-multi-line-text-field`,
  )
  field?.focus()
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
  <aside
    id="comment-panel"
    class="comment-panel"
    role="complementary"
    aria-label="Opmerkingen"
  >
    <div class="comment-panel__header">
      <h2 class="comment-panel__title">Opmerkingen</h2>
      <div class="comment-panel__actions">
        <label class="comment-panel__toggle">
          <input v-model="showResolved" type="checkbox" />
          Opgeloste tonen
        </label>
        <nldd-icon-button
          class="comment-panel__close"
          icon="dismiss"
          text="Sluiten"
          variant="neutral-transparent"
          @click="emit('close')"
        ></nldd-icon-button>
      </div>
    </div>

    <div class="comment-panel__body" ref="panelBodyRef">
      <!-- Empty state -->
      <p v-if="commentStore.loading" class="comment-panel__empty" role="status">Laden...</p>
      <p v-else-if="stackedEntries.length === 0" class="comment-panel__empty">
        Er zijn nog geen opmerkingen bij deze stap. Klik op "Opmerking" bij een vraag om er een te plaatsen.
      </p>

      <!-- Positioned comment groups (Google Docs style) -->
      <div
        v-for="entry in stackedEntries"
        :key="entry.fieldId"
        :data-field-group="entry.fieldId"
        class="comment-field-group"
        :class="{ 'comment-field-group--active': activeFieldId === entry.fieldId }"
        :style="{ '--comment-top': entry.top + 'px' }"
      >
        <button
          v-if="fieldLabels.get(entry.fieldId)"
          class="comment-field-group__label"
          @click="scrollToField(entry.fieldId)"
        >Opmerking voor: {{ fieldLabels.get(entry.fieldId) }}</button>

        <!-- Threads -->
        <nldd-card
          v-for="thread in entry.threads"
          :key="thread.id"
          class="comment-thread"
          :class="{ 'comment-thread--resolved': thread.resolvedAt }"
          :background="thread.resolvedAt ? 'tinted' : 'base'"
        >
          <nldd-container padding="8">
          <p v-if="thread.resolvedAt && hasOpenInput(thread)" class="comment-thread__resolved-label" role="status">
            Opgelost door {{ thread.resolvedByName || 'een collega' }} terwijl je hier aan het schrijven was.
          </p>

          <!-- Root comment -->
          <div class="comment-item">
            <div class="comment-item__header">
              <strong class="comment-item__author">{{ thread.authorName }}</strong>
              <time class="comment-item__time" :datetime="thread.createdAt">{{ formatDate(thread.createdAt) }}</time>
            </div>

            <div v-if="editingId === thread.id" class="comment-item__edit">
              <nldd-multi-line-text-field
                accessible-label="Opmerking bewerken"
                rows="2"
                resize="auto"
                :value="editBody"
                @input="editBody = readFieldValue($event)"
                @keydown.enter.meta="submitEdit"
                @keydown.escape="cancelEdit"
              ></nldd-multi-line-text-field>
              <div class="comment-item__edit-actions">
                <nldd-button size="xs" variant="primary" text="Opslaan" @click="submitEdit"></nldd-button>
                <nldd-button size="xs" variant="neutral-transparent" text="Annuleer" @click="cancelEdit"></nldd-button>
              </div>
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
                <strong class="comment-item__author">{{ reply.authorName }}</strong>
                <time class="comment-item__time" :datetime="reply.createdAt">{{ formatDate(reply.createdAt) }}</time>
              </div>

              <div v-if="editingId === reply.id" class="comment-item__edit">
                <nldd-multi-line-text-field
                  accessible-label="Reactie bewerken"
                  rows="2"
                  resize="auto"
                  :value="editBody"
                  @input="editBody = readFieldValue($event)"
                  @keydown.enter.meta="submitEdit"
                  @keydown.escape="cancelEdit"
                ></nldd-multi-line-text-field>
                <div class="comment-item__edit-actions">
                  <nldd-button size="xs" variant="primary" text="Opslaan" @click="submitEdit"></nldd-button>
                  <nldd-button size="xs" variant="neutral-transparent" text="Annuleer" @click="cancelEdit"></nldd-button>
                </div>
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
              @keydown.escape="cancelReply"
            ></nldd-multi-line-text-field>
            <div class="comment-reply-form__actions">
              <nldd-button size="xs" variant="primary" text="Reageer" @click="submitReply(thread.id, thread.fieldId)"></nldd-button>
              <nldd-button size="xs" variant="neutral-transparent" text="Annuleer" @click="cancelReply"></nldd-button>
            </div>
          </div>
          </nldd-container>
        </nldd-card>

        <!-- Inline new comment form (appears when this field is active) -->
        <div v-if="activeFieldId === entry.fieldId && canComment" class="comment-inline-form">
          <nldd-multi-line-text-field
            accessible-label="Nieuwe opmerking schrijven"
            rows="2"
            resize="auto"
            placeholder="Schrijf een opmerking..."
            :value="newCommentBody"
            @input="newCommentBody = readFieldValue($event)"
            @keydown.enter.meta="submitComment(entry.fieldId)"
            @keydown.escape="newCommentBody = ''; emit('deactivate-field')"
          ></nldd-multi-line-text-field>
          <div class="comment-inline-form__actions">
            <nldd-button
              size="xs"
              variant="primary"
              text="Plaatsen"
              :disabled="!newCommentBody.trim() || undefined"
              @click="submitComment(entry.fieldId)"
            ></nldd-button>
            <nldd-button
              size="xs"
              variant="neutral-transparent"
              text="Annuleer"
              @click="newCommentBody = ''; emit('deactivate-field')"
            ></nldd-button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

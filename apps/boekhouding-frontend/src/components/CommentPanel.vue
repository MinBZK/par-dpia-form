<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useCollaborationStore } from '../stores/collaboration'
import type { CommentThread } from '../api'
import { IconX, IconMessage, IconTrash, IconCheck, IconArrowBackUp } from '@tabler/icons-vue'

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
let formObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
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
    const text = label.querySelector('.rvo-form-field__label > :first-child')?.textContent?.trim()
      || label.textContent?.trim().split('\n')[0]?.trim()
      || fieldId
    labels.set(fieldId, text)
  }

  fieldPositions.value = positions
  fieldLabels.value = labels
}

function schedulePositionUpdate() {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => updateFieldPositions(), 50)
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
      : fieldThreads.filter(t => !t.resolvedAt)

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

onMounted(() => {
  requestAnimationFrame(() => updateFieldPositions())

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
  if (updateTimer) clearTimeout(updateTimer)
})

// Focus the textarea when a field is activated
watch(() => props.activeFieldId, async (fieldId) => {
  if (!fieldId || !canComment.value) return
  newCommentBody.value = ''
  await nextTick()
  updateFieldPositions()
  await nextTick()
  const textarea = panelBodyRef.value?.querySelector<HTMLTextAreaElement>(
    `[data-field-group="${CSS.escape(fieldId)}"] .comment-inline-form textarea`,
  )
  textarea?.focus()
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

async function submitComment(fieldId: string) {
  const body = newCommentBody.value.trim()
  if (!body) return

  await commentStore.createComment(fieldId, body)
  newCommentBody.value = ''
}

async function submitReply(parentId: string, fieldId: string) {
  const body = replyBody.value.trim()
  if (!body) return

  await commentStore.createReply(parentId, fieldId, body)
  replyBody.value = ''
  replyingTo.value = null
}

function startReply(threadId: string) {
  replyingTo.value = threadId
  replyBody.value = ''
}

function cancelReply() {
  replyingTo.value = null
  replyBody.value = ''
}

function autoResize(event: Event) {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

async function startEdit(id: string, currentBody: string) {
  editingId.value = id
  editBody.value = currentBody
  await nextTick()
  const textarea = panelBodyRef.value?.querySelector<HTMLTextAreaElement>(
    `.comment-item__edit textarea`,
  )
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
    textarea.focus()
  }
}

function cancelEdit() {
  editingId.value = null
  editBody.value = ''
}

async function submitEdit() {
  if (!editingId.value || !editBody.value.trim()) return
  await commentStore.updateComment(editingId.value, editBody.value.trim())
  editingId.value = null
  editBody.value = ''
}

async function handleDelete(commentId: string) {
  await commentStore.deleteComment(commentId)
}

async function handleResolve(commentId: string) {
  await commentStore.resolveThread(commentId)
}

async function handleReopen(commentId: string) {
  await commentStore.reopenThread(commentId)
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
        <button
          class="comment-panel__close"
          aria-label="Sluiten"
          @click="emit('close')"
        >
          <IconX :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="comment-panel__body" ref="panelBodyRef">
      <!-- Empty state -->
      <p v-if="commentStore.loading" class="comment-panel__empty" role="status">Laden...</p>
      <p v-else-if="positionedEntries.length === 0" class="comment-panel__empty">
        Er zijn nog geen opmerkingen bij deze stap. Klik op "Opmerking" bij een vraag om er een te plaatsen.
      </p>

      <!-- Positioned comment groups (Google Docs style) -->
      <div
        v-for="entry in positionedEntries"
        :key="entry.fieldId"
        :data-field-group="entry.fieldId"
        class="comment-field-group"
        :class="{ 'comment-field-group--active': activeFieldId === entry.fieldId }"
        :style="{ top: entry.top + 'px' }"
      >
        <button
          v-if="fieldLabels.get(entry.fieldId)"
          class="comment-field-group__label"
          @click="scrollToField(entry.fieldId)"
        >Opmerking voor: {{ fieldLabels.get(entry.fieldId) }}</button>

        <!-- Threads -->
        <div
          v-for="thread in entry.threads"
          :key="thread.id"
          class="comment-thread"
          :class="{ 'comment-thread--resolved': thread.resolvedAt }"
        >
          <!-- Root comment -->
          <div class="comment-item">
            <div class="comment-item__header">
              <strong class="comment-item__author">{{ thread.authorName }}</strong>
              <time class="comment-item__time" :datetime="thread.createdAt">{{ formatDate(thread.createdAt) }}</time>
            </div>

            <div v-if="editingId === thread.id" class="comment-item__edit">
              <textarea
                v-model="editBody"
                class="comment-input"
                aria-label="Opmerking bewerken"
                rows="1"
                @input="autoResize"
                @keydown.enter.meta="submitEdit"
                @keydown.escape="cancelEdit"
              />
              <div class="comment-item__edit-actions">
                <button class="comment-btn comment-btn--primary" @click="submitEdit">Opslaan</button>
                <button class="comment-action-btn" @click="cancelEdit">Annuleer</button>
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
              <button v-if="canComment && !thread.resolvedAt" class="comment-action-btn" @click="startReply(thread.id)">
                <IconMessage :size="14" aria-hidden="true" /> Reageren
              </button>
              <button v-if="canDeleteComment(thread.authorId)" class="comment-action-btn comment-action-btn--danger" @click="handleDelete(thread.id)">
                <IconTrash :size="14" aria-hidden="true" /> Verwijderen
              </button>
              <div class="comment-item__spacer"></div>
              <button v-if="canResolve && !thread.resolvedAt" class="comment-action-btn comment-action-btn--resolve" @click="handleResolve(thread.id)">
                <IconCheck :size="14" aria-hidden="true" /> Oplossen
              </button>
              <button v-if="canResolve && thread.resolvedAt" class="comment-action-btn" @click="handleReopen(thread.id)">
                <IconArrowBackUp :size="14" aria-hidden="true" /> Heropenen
              </button>
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
                <textarea
                  v-model="editBody"
                  class="comment-input"
                  aria-label="Reactie bewerken"
                  rows="1"
                  @input="autoResize"
                  @keydown.enter.meta="submitEdit"
                  @keydown.escape="cancelEdit"
                />
                <div class="comment-item__edit-actions">
                  <button class="comment-btn comment-btn--primary" @click="submitEdit">Opslaan</button>
                  <button class="comment-action-btn" @click="cancelEdit">Annuleer</button>
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
                <button v-if="canDeleteComment(reply.authorId)" class="comment-action-btn comment-action-btn--danger" @click="handleDelete(reply.id)">
                  <IconTrash :size="14" aria-hidden="true" /> Verwijderen
                </button>
              </div>
            </div>
          </div>

          <!-- Reply form -->
          <div v-if="replyingTo === thread.id" class="comment-reply-form">
            <textarea
              v-model="replyBody"
              class="comment-input"
              aria-label="Reactie schrijven"
              rows="1"
              placeholder="Schrijf een reactie..."
              @input="autoResize"
              @keydown.enter.meta="submitReply(thread.id, thread.fieldId)"
              @keydown.escape="cancelReply"
            />
            <div class="comment-reply-form__actions">
              <button class="comment-btn comment-btn--primary" @click="submitReply(thread.id, thread.fieldId)">Reageer</button>
              <button class="comment-action-btn" @click="cancelReply">Annuleer</button>
            </div>
          </div>
        </div>

        <!-- Inline new comment form (appears when this field is active) -->
        <div v-if="activeFieldId === entry.fieldId && canComment" class="comment-inline-form">
          <textarea
            v-model="newCommentBody"
            class="comment-input"
            aria-label="Nieuwe opmerking schrijven"
            rows="1"
            placeholder="Schrijf een opmerking..."
            @input="autoResize"
            @keydown.enter.meta="submitComment(entry.fieldId)"
            @keydown.escape="newCommentBody = ''; emit('deactivate-field')"
          />
          <div class="comment-inline-form__actions">
            <button
              class="comment-btn comment-btn--primary"
              :disabled="!newCommentBody.trim()"
              @click="submitComment(entry.fieldId)"
            >Plaatsen</button>
            <button class="comment-action-btn" @click="newCommentBody = ''; emit('deactivate-field')">Annuleer</button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

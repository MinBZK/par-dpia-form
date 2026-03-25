import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { commentsApi, type CommentThread, type CommentReply } from '../api'

const POLL_INTERVAL_MS = 10_000

export const useCommentStore = defineStore('comments', () => {
  const assessmentId = ref<string | null>(null)
  const threads = ref<CommentThread[]>([])
  const lastModifiedAt = ref<string | null>(null)
  const assessmentVersion = ref<number | null>(null)
  const currentUserId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let visibilityHandler: (() => void) | null = null

  // — Computed getters —

  const threadsByField = computed(() => {
    const map = new Map<string, CommentThread[]>()
    for (const thread of threads.value) {
      const list = map.get(thread.fieldId) || []
      list.push(thread)
      map.set(thread.fieldId, list)
    }
    return map
  })

  const unresolvedCountByField = computed(() => {
    const map = new Map<string, number>()
    for (const thread of threads.value) {
      if (!thread.resolvedAt) {
        map.set(thread.fieldId, (map.get(thread.fieldId) || 0) + 1)
      }
    }
    return map
  })

  const totalUnresolvedCount = computed(() =>
    threads.value.filter(t => !t.resolvedAt).length,
  )

  // — Actions —

  async function loadComments(id: string) {
    assessmentId.value = id
    loading.value = true
    error.value = null

    try {
      const response = await commentsApi.list(id)
      threads.value = response.comments
      lastModifiedAt.value = response.lastModifiedAt
      assessmentVersion.value = response.assessmentVersion
      currentUserId.value = response.currentUserId
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function pollForUpdates() {
    if (!assessmentId.value || !lastModifiedAt.value) return

    try {
      const response = await commentsApi.list(assessmentId.value, lastModifiedAt.value)

      if (response.comments.length > 0) {
        // Merge updated comments into existing threads
        for (const updated of response.comments) {
          if (updated.parentId === null) {
            // Root comment — update or add thread
            const idx = threads.value.findIndex(t => t.id === updated.id)
            if (idx >= 0) {
              // Preserve existing replies, merge updated fields
              threads.value[idx] = {
                ...threads.value[idx],
                ...updated,
                replies: threads.value[idx].replies,
              }
            } else {
              // New thread
              threads.value.push({ ...updated as CommentThread, replies: (updated as CommentThread).replies || [] })
            }
          } else {
            // Reply — find parent thread and update/add
            const parent = threads.value.find(t => t.id === updated.parentId)
            if (parent) {
              const replyIdx = parent.replies.findIndex(r => r.id === updated.id)
              if (replyIdx >= 0) {
                parent.replies[replyIdx] = updated as unknown as CommentReply
              } else {
                parent.replies.push(updated as unknown as CommentReply)
              }
            }
          }
        }
      }

      lastModifiedAt.value = response.lastModifiedAt
      assessmentVersion.value = response.assessmentVersion
    } catch {
      // Silently ignore poll errors — next poll will retry
    }
  }

  function startPolling() {
    stopPolling()

    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollForUpdates()
      }
    }, POLL_INTERVAL_MS)

    // Pause/resume on visibility change
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        pollForUpdates() // Immediate check on tab focus
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
  }

  async function createComment(fieldId: string, body: string) {
    if (!assessmentId.value) return

    const created = await commentsApi.create(assessmentId.value, fieldId, body)
    // Add as new thread
    threads.value.push({ ...created, replies: created.replies || [] })
    return created
  }

  async function createReply(parentId: string, fieldId: string, body: string) {
    if (!assessmentId.value) return

    const created = await commentsApi.create(assessmentId.value, fieldId, body, parentId)
    const thread = threads.value.find(t => t.id === parentId)
    if (thread) {
      thread.replies.push({
        id: created.id,
        parentId,
        authorId: created.authorId,
        authorName: created.authorName,
        body: created.body,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      })
    }
    return created
  }

  async function updateComment(commentId: string, body: string) {
    if (!assessmentId.value) return

    await commentsApi.update(assessmentId.value, commentId, body)

    // Update locally
    for (const thread of threads.value) {
      if (thread.id === commentId) {
        thread.body = body
        thread.updatedAt = new Date().toISOString()
        return
      }
      for (const reply of thread.replies) {
        if (reply.id === commentId) {
          reply.body = body
          reply.updatedAt = new Date().toISOString()
          return
        }
      }
    }
  }

  async function deleteComment(commentId: string) {
    if (!assessmentId.value) return

    await commentsApi.delete(assessmentId.value, commentId)

    // Remove locally
    // Check if it's a root thread
    const threadIdx = threads.value.findIndex(t => t.id === commentId)
    if (threadIdx >= 0) {
      threads.value.splice(threadIdx, 1)
      return
    }

    // It's a reply — find and remove
    for (const thread of threads.value) {
      const replyIdx = thread.replies.findIndex(r => r.id === commentId)
      if (replyIdx >= 0) {
        thread.replies.splice(replyIdx, 1)
        return
      }
    }
  }

  async function resolveThread(commentId: string) {
    if (!assessmentId.value) return

    const updated = await commentsApi.resolve(assessmentId.value, commentId)
    const thread = threads.value.find(t => t.id === commentId)
    if (thread) {
      thread.resolvedAt = updated.resolvedAt
      thread.resolvedBy = updated.resolvedBy
    }
  }

  async function reopenThread(commentId: string) {
    if (!assessmentId.value) return

    await commentsApi.reopen(assessmentId.value, commentId)
    const thread = threads.value.find(t => t.id === commentId)
    if (thread) {
      thread.resolvedAt = null
      thread.resolvedBy = null
    }
  }

  function reset() {
    stopPolling()
    assessmentId.value = null
    threads.value = []
    lastModifiedAt.value = null
    assessmentVersion.value = null
    currentUserId.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    assessmentId,
    threads,
    lastModifiedAt,
    assessmentVersion,
    currentUserId,
    loading,
    error,
    // Computed
    threadsByField,
    unresolvedCountByField,
    totalUnresolvedCount,
    // Actions
    loadComments,
    startPolling,
    stopPolling,
    createComment,
    createReply,
    updateComment,
    deleteComment,
    resolveThread,
    reopenThread,
    reset,
  }
})

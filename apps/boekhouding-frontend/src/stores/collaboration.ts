import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { commentsApi, syncApi, SessionExpiredError, type CommentThread, type CommentReply } from '../api'

const POLL_INTERVAL_MS = 10_000

export const useCollaborationStore = defineStore('collaboration', () => {
  const assessmentId = ref<string | null>(null)
  const threads = ref<CommentThread[]>([])
  const lastModifiedAt = ref<string | null>(null)
  const currentUserId = ref<string | null>(null)

  // Sync signals (populated by sync endpoint, not comments)
  const assessmentVersion = ref<number | null>(null)
  const assessmentUpdatedAt = ref<string | null>(null)
  const lastModifiedBySelf = ref<boolean>(true)

  const loading = ref(false)
  const error = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null
  let isPolling = false

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

  async function load(id: string) {
    assessmentId.value = id
    loading.value = true
    error.value = null

    try {
      const [commentsResponse, syncResponse] = await Promise.all([
        commentsApi.list(id),
        syncApi.get(id),
      ])
      threads.value = commentsResponse.comments
      lastModifiedAt.value = commentsResponse.lastModifiedAt
      currentUserId.value = commentsResponse.currentUserId
      assessmentVersion.value = syncResponse.version
      assessmentUpdatedAt.value = syncResponse.updatedAt
      lastModifiedBySelf.value = syncResponse.lastModifiedBySelf
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  function localCommentCount(): number {
    let n = 0
    for (const t of threads.value) n += 1 + t.replies.length
    return n
  }

  async function pollForUpdates() {
    if (isPolling || !assessmentId.value) return
    isPolling = true

    try {
      const syncResponse = await syncApi.get(assessmentId.value)

      // Detect deletions: when a comment is removed, the /comments?since=... query can't report it
      // (the row is gone). A count mismatch is our signal to do a full refresh instead of incremental.
      const needsFullRefresh = syncResponse.commentCount !== localCommentCount()

      const commentsResponse = needsFullRefresh
        ? await commentsApi.list(assessmentId.value)
        : await commentsApi.list(assessmentId.value, lastModifiedAt.value ?? undefined)

      if (needsFullRefresh) {
        threads.value = commentsResponse.comments
      } else if (commentsResponse.comments.length > 0) {
        for (const updated of commentsResponse.comments) {
          if (updated.parentId === null) {
            const idx = threads.value.findIndex(t => t.id === updated.id)
            if (idx >= 0) {
              threads.value[idx] = {
                ...threads.value[idx],
                ...updated,
                replies: threads.value[idx].replies,
              }
            } else {
              threads.value.push({ ...updated as CommentThread, replies: (updated as CommentThread).replies || [] })
            }
          } else {
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

      lastModifiedAt.value = commentsResponse.lastModifiedAt
      assessmentVersion.value = syncResponse.version
      assessmentUpdatedAt.value = syncResponse.updatedAt
      lastModifiedBySelf.value = syncResponse.lastModifiedBySelf
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        stopPolling()
        return
      }
      // Silently ignore other poll errors — next poll will retry
    } finally {
      isPolling = false
    }
  }

  // Recursive setTimeout — guarantees POLL_INTERVAL_MS between end of one poll and start of the next, preventing
  // cascading delays when polls are slow.
  async function schedulePoll() {
    if (document.visibilityState === 'visible') {
      await pollForUpdates()
    }
    pollTimer = setTimeout(schedulePoll, POLL_INTERVAL_MS)
  }

  function startPolling() {
    stopPolling()

    pollTimer = setTimeout(schedulePoll, POLL_INTERVAL_MS)

    // Pause/resume on visibility change — immediate check on tab focus
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        pollForUpdates()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer)
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

    const threadIdx = threads.value.findIndex(t => t.id === commentId)
    if (threadIdx >= 0) {
      threads.value.splice(threadIdx, 1)
      return
    }

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
    assessmentUpdatedAt.value = null
    lastModifiedBySelf.value = true
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
    assessmentUpdatedAt,
    lastModifiedBySelf,
    currentUserId,
    loading,
    error,
    // Computed
    threadsByField,
    unresolvedCountByField,
    totalUnresolvedCount,
    // Actions
    load,
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

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { commentsApi, syncApi, ApiError, SessionExpiredError, type CommentThread, type CommentReply } from '../api'

const POLL_INTERVAL_MS = 10_000
// Consecutive failed polls before the user is told the document may be stale. A
// single miss heals itself on the next tick and is not worth a message.
const SYNC_FAILURE_THRESHOLD = 3

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
  const syncFailing = ref(false)

  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let visibilityHandler: (() => void) | null = null
  let isPolling = false
  let consecutiveFailures = 0
  let pollBlockedUntil = 0

  // Bumped when a local mutation starts and again when it settles, so any change across a
  // poll means a mutation overlapped it. A poll response reflects the server as it was when
  // the request went out, which may predate an overlapping mutation; applying it would revert
  // that mutation. Such a response is dropped without moving the watermark, so the next poll
  // fetches the same delta again.
  let mutationSeq = 0

  async function mutate<T>(action: () => Promise<T>): Promise<T> {
    mutationSeq++
    try {
      return await action()
    } finally {
      mutationSeq++
    }
  }

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
    const id = assessmentId.value
    if (isPolling || !id) return
    // Respect a 429's Retry-After instead of knocking every POLL_INTERVAL_MS,
    // which would keep the bucket empty for the whole window.
    if (Date.now() < pollBlockedUntil) return
    isPolling = true
    const seenMutationSeq = mutationSeq

    try {
      const syncResponse = await syncApi.get(id)

      // Detect deletions: when a comment is removed, the /comments?since=... query can't report it
      // (the row is gone). A count mismatch is our signal to do a full refresh instead of incremental.
      const needsFullRefresh = syncResponse.commentCount !== localCommentCount()

      const commentsResponse = needsFullRefresh
        ? await commentsApi.list(id)
        : await commentsApi.list(id, lastModifiedAt.value ?? undefined)

      // Drop the response when a mutation overlapped the poll, or when the store moved to
      // another assessment while the requests were in flight.
      if (mutationSeq !== seenMutationSeq || assessmentId.value !== id) return

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
      consecutiveFailures = 0
      syncFailing.value = false
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        stopPolling()
        return
      }
      // A single failed poll heals itself on the next tick; only a run of them is
      // reported, so the user knows they may be looking at a stale document.
      consecutiveFailures++
      syncFailing.value = consecutiveFailures >= SYNC_FAILURE_THRESHOLD
      if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
        pollBlockedUntil = Date.now() + error.retryAfterSeconds * 1000
      }
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
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      const created = await commentsApi.create(id, fieldId, body)
      threads.value.push({ ...created, replies: created.replies || [] })
      return created
    })
  }

  async function createReply(parentId: string, fieldId: string, body: string) {
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      const created = await commentsApi.create(id, fieldId, body, parentId)
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
    })
  }

  async function updateComment(commentId: string, body: string) {
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      await commentsApi.update(id, commentId, body)

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
    })
  }

  async function deleteComment(commentId: string) {
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      await commentsApi.delete(id, commentId)

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
    })
  }

  async function resolveThread(commentId: string) {
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      const updated = await commentsApi.resolve(id, commentId)
      const thread = threads.value.find(t => t.id === commentId)
      if (thread) {
        thread.resolvedAt = updated.resolvedAt
        thread.resolvedBy = updated.resolvedBy
      }
    })
  }

  async function reopenThread(commentId: string) {
    const id = assessmentId.value
    if (!id) return

    return mutate(async () => {
      await commentsApi.reopen(id, commentId)
      const thread = threads.value.find(t => t.id === commentId)
      if (thread) {
        thread.resolvedAt = null
        thread.resolvedBy = null
      }
    })
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
    syncFailing,
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

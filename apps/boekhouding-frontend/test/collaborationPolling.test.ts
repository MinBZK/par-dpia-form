/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock both APIs
const mockCommentsList = vi.fn()
const mockSyncGet = vi.fn()

vi.mock('../src/api', () => ({
  commentsApi: { list: (...args: unknown[]) => mockCommentsList(...args) },
  syncApi: { get: (...args: unknown[]) => mockSyncGet(...args) },
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() {
      super('Sessie verlopen')
      this.name = 'SessionExpiredError'
    }
  },
}))

function commentsResponse(overrides: Record<string, unknown> = {}) {
  return {
    comments: [],
    lastModifiedAt: null,
    currentUserId: 'user-1',
    ...overrides,
  }
}

function syncResponse(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    updatedAt: '2026-04-12T12:00:00.000Z',
    lastModifiedBySelf: true,
    commentCount: 0,
    ...overrides,
  }
}

describe('collaboration store polling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockCommentsList.mockReset()
    mockSyncGet.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads both comments and sync endpoints in parallel', async () => {
    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    mockSyncGet.mockResolvedValueOnce(syncResponse())

    const { useCollaborationStore } = await import('../src/stores/collaboration')
    const store = useCollaborationStore()

    await store.load('assessment-1')

    expect(mockCommentsList).toHaveBeenCalledWith('assessment-1')
    expect(mockSyncGet).toHaveBeenCalledWith('assessment-1')
    expect(store.assessmentVersion).toBe(1)
    expect(store.lastModifiedBySelf).toBe(true)
  })

  it('stores lastModifiedBySelf=false when another user made the change', async () => {
    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    mockSyncGet.mockResolvedValueOnce(syncResponse({
      version: 3,
      updatedAt: '2026-04-12T14:00:00.000Z',
      lastModifiedBySelf: false,
    }))

    const { useCollaborationStore } = await import('../src/stores/collaboration')
    const store = useCollaborationStore()

    await store.load('assessment-1')

    expect(store.assessmentVersion).toBe(3)
    expect(store.assessmentUpdatedAt).toBe('2026-04-12T14:00:00.000Z')
    expect(store.lastModifiedBySelf).toBe(false)
  })

  it('resets all fields including sync state', async () => {
    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    mockSyncGet.mockResolvedValueOnce(syncResponse({
      version: 5,
      updatedAt: '2026-04-12T16:00:00.000Z',
      lastModifiedBySelf: false,
    }))

    const { useCollaborationStore } = await import('../src/stores/collaboration')
    const store = useCollaborationStore()

    await store.load('assessment-1')
    expect(store.assessmentVersion).toBe(5)
    expect(store.lastModifiedBySelf).toBe(false)

    store.reset()

    expect(store.assessmentVersion).toBeNull()
    expect(store.assessmentUpdatedAt).toBeNull()
    expect(store.lastModifiedBySelf).toBe(true) // reset default
    expect(store.currentUserId).toBeNull()
    expect(store.threads).toHaveLength(0)
  })

  it('comments response no longer contains sync fields', async () => {
    // This test documents the API contract: sync data is NOT in comments response
    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    mockSyncGet.mockResolvedValueOnce(syncResponse({
      version: 7,
      updatedAt: '2026-04-12T18:00:00.000Z',
      lastModifiedBySelf: true,
    }))

    const { useCollaborationStore } = await import('../src/stores/collaboration')
    const store = useCollaborationStore()

    await store.load('assessment-1')

    // Sync data comes from syncApi.get(), not commentsApi.list()
    expect(store.assessmentVersion).toBe(7)
    expect(mockSyncGet).toHaveBeenCalledTimes(1)
  })
})

describe('collaboration store parallel loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockCommentsList.mockReset()
    mockSyncGet.mockReset()
  })

  it('calls comments and sync endpoints in parallel (not sequentially)', async () => {
    // Both mocks slow: if sequential, total time ~2s; if parallel, ~1s
    let commentsResolvedAt = 0
    let syncResolvedAt = 0
    const start = Date.now()

    mockCommentsList.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 50))
      commentsResolvedAt = Date.now()
      return commentsResponse()
    })
    mockSyncGet.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 50))
      syncResolvedAt = Date.now()
      return syncResponse()
    })

    const { useCollaborationStore } = await import('../src/stores/collaboration')
    const store = useCollaborationStore()
    await store.load('assessment-1')

    // Both should have resolved within ~50ms of start, not sequentially
    expect(commentsResolvedAt - start).toBeLessThan(100)
    expect(syncResolvedAt - start).toBeLessThan(100)
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock commentsApi
const mockList = vi.fn()

vi.mock('../src/api', () => ({
  commentsApi: { list: (...args: unknown[]) => mockList(...args) },
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() {
      super('Sessie verlopen')
      this.name = 'SessionExpiredError'
    }
  },
}))

describe('comment store polling with null lastModifiedAt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockList.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('polls without since parameter when lastModifiedAt is null', async () => {
    mockList.mockResolvedValueOnce({
      comments: [],
      lastModifiedAt: null,
      assessmentVersion: 1,
      currentUserId: 'user-1',
    })

    const { useCommentStore } = await import('../src/stores/comments')
    const store = useCommentStore()

    await store.loadComments('assessment-1')
    expect(store.lastModifiedAt).toBeNull()

    mockList.mockResolvedValueOnce({
      comments: [],
      lastModifiedAt: null,
      assessmentVersion: 1,
      currentUserId: 'user-1',
    })

    await store.loadComments('assessment-1')

    expect(mockList).toHaveBeenLastCalledWith('assessment-1')
  })

  it('polls with since parameter when lastModifiedAt has a value', async () => {
    const timestamp = '2026-03-20T12:00:00.000Z'

    mockList.mockResolvedValueOnce({
      comments: [{ id: 'c1', fieldId: '1.1', parentId: null, authorId: 'u1', authorName: 'Sam', body: 'test', resolvedAt: null, resolvedBy: null, createdAt: timestamp, updatedAt: timestamp, replies: [] }],
      lastModifiedAt: timestamp,
      assessmentVersion: 1,
      currentUserId: 'user-1',
    })

    const { useCommentStore } = await import('../src/stores/comments')
    const store = useCommentStore()

    await store.loadComments('assessment-1')
    expect(store.lastModifiedAt).toBe(timestamp)
  })

  it('transitions from null to a timestamp when first comment arrives', async () => {
    mockList.mockResolvedValueOnce({
      comments: [],
      lastModifiedAt: null,
      assessmentVersion: 1,
      currentUserId: 'user-1',
    })

    const { useCommentStore } = await import('../src/stores/comments')
    const store = useCommentStore()

    await store.loadComments('assessment-1')
    expect(store.lastModifiedAt).toBeNull()

    const timestamp = '2026-03-25T09:00:00.000Z'
    mockList.mockResolvedValueOnce({
      comments: [{ id: 'c1', fieldId: '1.1', parentId: null, authorId: 'u1', authorName: 'Sam', body: 'hello', resolvedAt: null, resolvedBy: null, createdAt: timestamp, updatedAt: timestamp, replies: [] }],
      lastModifiedAt: timestamp,
      assessmentVersion: 1,
      currentUserId: 'user-1',
    })

    await store.loadComments('assessment-1')
    expect(store.lastModifiedAt).toBe(timestamp)
  })
})

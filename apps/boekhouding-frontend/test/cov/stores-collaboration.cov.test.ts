/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockCommentsList = vi.fn()
const mockCommentsCreate = vi.fn()
const mockCommentsUpdate = vi.fn()
const mockCommentsDelete = vi.fn()
const mockCommentsResolve = vi.fn()
const mockCommentsReopen = vi.fn()
const mockSyncGet = vi.fn()

class FakeSessionExpiredError extends Error {
  constructor() {
    super('Sessie verlopen')
    this.name = 'SessionExpiredError'
  }
}

class FakeApiError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

vi.mock('../../src/api', () => ({
  commentsApi: {
    list: (...args: unknown[]) => mockCommentsList(...args),
    create: (...args: unknown[]) => mockCommentsCreate(...args),
    update: (...args: unknown[]) => mockCommentsUpdate(...args),
    delete: (...args: unknown[]) => mockCommentsDelete(...args),
    resolve: (...args: unknown[]) => mockCommentsResolve(...args),
    reopen: (...args: unknown[]) => mockCommentsReopen(...args),
  },
  syncApi: { get: (...args: unknown[]) => mockSyncGet(...args) },
  SessionExpiredError: FakeSessionExpiredError,
  ApiError: FakeApiError,
}))

function makeThread(overrides: Record<string, unknown> = {}): any {
  return {
    id: 't1',
    fieldId: 'field-a',
    parentId: null,
    authorId: 'user-1',
    authorName: 'Sam',
    body: 'Eerste opmerking',
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    createdAt: '2026-04-12T12:00:00.000Z',
    updatedAt: '2026-04-12T12:00:00.000Z',
    replies: [],
    ...overrides,
  }
}

function makeReply(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'r1',
    parentId: 't1',
    authorId: 'user-2',
    authorName: 'Noor',
    body: 'Een reactie',
    createdAt: '2026-04-12T13:00:00.000Z',
    updatedAt: '2026-04-12T13:00:00.000Z',
    ...overrides,
  }
}

function commentsResponse(overrides: Record<string, unknown> = {}): any {
  return {
    comments: [],
    lastModifiedAt: null,
    currentUserId: 'user-1',
    ...overrides,
  }
}

function syncResponse(overrides: Record<string, unknown> = {}): any {
  return {
    version: 1,
    updatedAt: '2026-04-12T12:00:00.000Z',
    lastModifiedBySelf: true,
    commentCount: 0,
    ...overrides,
  }
}

type Store = ReturnType<
  Awaited<typeof import('../../src/stores/collaboration')>['useCollaborationStore']
>

async function freshStore(): Promise<Store> {
  const { useCollaborationStore } = await import('../../src/stores/collaboration')
  return useCollaborationStore()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetModules()
  mockCommentsList.mockReset()
  mockCommentsCreate.mockReset()
  mockCommentsUpdate.mockReset()
  mockCommentsDelete.mockReset()
  mockCommentsResolve.mockReset()
  mockCommentsReopen.mockReset()
  mockSyncGet.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('computed getters', () => {
  it('groups threads by field and counts unresolved per field + total', async () => {
    const store = await freshStore()
    store.threads = [
      makeThread({ id: 't1', fieldId: 'field-a', resolvedAt: null }),
      makeThread({ id: 't2', fieldId: 'field-a', resolvedAt: null }),
      makeThread({ id: 't3', fieldId: 'field-b', resolvedAt: '2026-04-12T12:00:00.000Z' }),
    ]

    const byField = store.threadsByField
    expect(byField.get('field-a')).toHaveLength(2)
    expect(byField.get('field-b')).toHaveLength(1)

    const unresolved = store.unresolvedCountByField
    expect(unresolved.get('field-a')).toBe(2)
    expect(unresolved.has('field-b')).toBe(false)

    expect(store.totalUnresolvedCount).toBe(2)
  })

  it('returns empty maps and zero for no threads', async () => {
    const store = await freshStore()
    expect(store.threadsByField.size).toBe(0)
    expect(store.unresolvedCountByField.size).toBe(0)
    expect(store.totalUnresolvedCount).toBe(0)
  })
})

describe('load()', () => {
  it('populates threads and sync state on success', async () => {
    mockCommentsList.mockResolvedValueOnce(
      commentsResponse({
        comments: [makeThread()],
        lastModifiedAt: '2026-04-12T12:00:00.000Z',
        currentUserId: 'user-9',
      }),
    )
    mockSyncGet.mockResolvedValueOnce(
      syncResponse({ version: 4, updatedAt: '2026-04-12T13:00:00.000Z', lastModifiedBySelf: false }),
    )

    const store = await freshStore()
    await store.load('assessment-1')

    expect(store.assessmentId).toBe('assessment-1')
    expect(store.threads).toHaveLength(1)
    expect(store.lastModifiedAt).toBe('2026-04-12T12:00:00.000Z')
    expect(store.currentUserId).toBe('user-9')
    expect(store.assessmentVersion).toBe(4)
    expect(store.assessmentUpdatedAt).toBe('2026-04-12T13:00:00.000Z')
    expect(store.lastModifiedBySelf).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('captures the error message in the catch path and still clears loading', async () => {
    mockCommentsList.mockRejectedValueOnce(new Error('netwerkfout'))
    mockSyncGet.mockResolvedValueOnce(syncResponse())

    const store = await freshStore()
    await store.load('assessment-1')

    expect(store.error).toBe('netwerkfout')
    expect(store.loading).toBe(false)
  })
})

describe('pollForUpdates()', () => {
  it('does nothing without an assessmentId (early return)', async () => {
    const store = await freshStore()
    store.startPolling()
    expect(mockSyncGet).not.toHaveBeenCalled()
    store.stopPolling()
  })

  it('skips re-entrant polls while one is already in flight (isPolling guard)', async () => {
    let release: (v: any) => void = () => {}
    const gate = new Promise<any>((r) => { release = r })
    mockSyncGet.mockReturnValueOnce(gate)

    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = []
    store.lastModifiedAt = null

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockSyncGet).toHaveBeenCalledTimes(1)

    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    release(syncResponse({ commentCount: 0 }))
    await vi.waitFor(() => expect(store.assessmentVersion).toBe(1))
    store.stopPolling()
  })

})

// pollForUpdates is not exported; reach it via the visibility handler (registered by startPolling).
describe('pollForUpdates() via visibility handler', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    })
  }

  afterEach(() => {
    setVisibility('visible')
  })

  it('full refresh replaces threads when commentCount mismatches', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ replies: [makeReply()] })]
    store.lastModifiedAt = '2026-04-12T12:00:00.000Z'

    mockSyncGet.mockResolvedValueOnce(
      syncResponse({ commentCount: 99, version: 2, updatedAt: 'U2', lastModifiedBySelf: false }),
    )
    mockCommentsList.mockResolvedValueOnce(
      commentsResponse({ comments: [makeThread({ id: 'fresh' })], lastModifiedAt: 'NEW' }),
    )

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(store.threads[0].id).toBe('fresh'))

    expect(store.assessmentVersion).toBe(2)
    expect(store.assessmentUpdatedAt).toBe('U2')
    expect(store.lastModifiedBySelf).toBe(false)
    expect(store.lastModifiedAt).toBe('NEW')
    expect(mockCommentsList).toHaveBeenCalledWith('assessment-1')
    store.stopPolling()
  })

  it('incremental update merges an existing thread, appends a new thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', body: 'oud', replies: [] })]
    store.lastModifiedAt = '2026-04-12T12:00:00.000Z'

    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1 }))
    mockCommentsList.mockResolvedValueOnce(
      commentsResponse({
        comments: [
          makeThread({ id: 't1', body: 'bijgewerkt', replies: undefined }),
          makeThread({ id: 't2', body: 'nieuw', replies: undefined }),
        ],
        lastModifiedAt: 'INC',
      }),
    )

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(store.threads).toHaveLength(2))

    const t1 = store.threads.find((t) => t.id === 't1')!
    expect(t1.body).toBe('bijgewerkt')
    expect(t1.replies).toEqual([])
    const t2 = store.threads.find((t) => t.id === 't2')!
    expect(t2.replies).toEqual([])
    expect(mockCommentsList).toHaveBeenCalledWith('assessment-1', '2026-04-12T12:00:00.000Z')
    expect(store.lastModifiedAt).toBe('INC')
    store.stopPolling()
  })

  it('incremental update pushes new thread with provided replies (replies truthy branch)', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [] })]
    store.lastModifiedAt = null

    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1 }))
    const incomingReplies = [makeReply({ id: 'r9' })]
    mockCommentsList.mockResolvedValueOnce(
      commentsResponse({ comments: [makeThread({ id: 'tNew', replies: incomingReplies })] }),
    )

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(store.threads.some((t) => t.id === 'tNew')).toBe(true))

    const tNew = store.threads.find((t) => t.id === 'tNew')!
    expect(tNew.replies).toEqual(incomingReplies)
    expect(mockCommentsList).toHaveBeenCalledWith('assessment-1', undefined)
    store.stopPolling()
  })

  it('incremental update applies a reply: existing reply updated and new reply appended', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 'parent', replies: [makeReply({ id: 'r1', body: 'oud' })] })]
    store.lastModifiedAt = 't0'

    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 2 }))
    mockCommentsList.mockResolvedValueOnce(
      commentsResponse({
        comments: [
          makeReply({ id: 'r1', parentId: 'parent', body: 'nieuw' }),
          makeReply({ id: 'r2', parentId: 'parent', body: 'extra' }),
          makeReply({ id: 'rX', parentId: 'onbekend', body: 'wees' }),
        ],
      }),
    )

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() =>
      expect(store.threads[0].replies.some((r) => r.id === 'r2')).toBe(true),
    )

    const parent = store.threads[0]
    expect(parent.replies.find((r) => r.id === 'r1')!.body).toBe('nieuw')
    expect(parent.replies.find((r) => r.id === 'r2')!.body).toBe('extra')
    expect(parent.replies.some((r) => r.id === 'rX')).toBe(false)
    store.stopPolling()
  })

  it('does not iterate when incremental response has no comments (length 0 branch)', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [] })]
    store.lastModifiedAt = 't0'

    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1, version: 7 }))
    mockCommentsList.mockResolvedValueOnce(commentsResponse({ comments: [], lastModifiedAt: 'same' }))

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(store.assessmentVersion).toBe(7))

    expect(store.threads).toHaveLength(1)
    expect(store.lastModifiedAt).toBe('same')
    store.stopPolling()
  })

  it('stops polling when a SessionExpiredError is thrown', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = []
    store.lastModifiedAt = null

    mockSyncGet.mockRejectedValueOnce(new FakeSessionExpiredError())

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockSyncGet).toHaveBeenCalledTimes(1))

    mockSyncGet.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mockSyncGet).not.toHaveBeenCalled()
  })

  it('silently ignores non-session poll errors', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = []
    store.lastModifiedAt = null

    mockSyncGet.mockRejectedValueOnce(new Error('tijdelijke fout'))

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockSyncGet).toHaveBeenCalledTimes(1))

    expect(store.error).toBeNull()
    mockSyncGet.mockResolvedValueOnce(syncResponse())
    mockCommentsList.mockResolvedValueOnce(commentsResponse())
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockSyncGet).toHaveBeenCalledTimes(2))
    store.stopPolling()
  })

  it('does not poll on visibility change while the tab is hidden', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'

    store.startPolling()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockSyncGet).not.toHaveBeenCalled()
    store.stopPolling()
  })
})

describe('resolve while a poll is in flight (issue #440)', () => {
  it('keeps a locally resolved thread resolved when a pre-resolve snapshot lands', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [] })]
    store.lastModifiedAt = null

    let releaseList: (v: any) => void = () => {}
    const listGate = new Promise<any>((r) => { releaseList = r })
    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1 }))
    mockCommentsList.mockReturnValueOnce(listGate)

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockCommentsList).toHaveBeenCalledTimes(1))

    mockCommentsResolve.mockResolvedValueOnce({
      resolvedAt: '2026-04-12T14:00:00.000Z',
      resolvedBy: 'user-1',
    })
    await store.resolveThread('t1')
    expect(store.threads[0].resolvedAt).toBe('2026-04-12T14:00:00.000Z')

    releaseList(commentsResponse({
      comments: [makeThread({ id: 't1', replies: undefined })],
      lastModifiedAt: '2026-04-12T12:00:00.000Z',
    }))
    await listGate
    await new Promise((r) => setTimeout(r, 0))

    expect(store.threads[0].resolvedAt).toBe('2026-04-12T14:00:00.000Z')
    expect(store.lastModifiedAt).toBeNull()
    store.stopPolling()
  })

  it('keeps the resolve when the poll starts while the resolve is still in flight', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [] })]
    store.lastModifiedAt = null

    // The resolve goes out first and is still awaiting its response.
    let releaseResolve: (v: any) => void = () => {}
    const resolveGate = new Promise<any>((r) => { releaseResolve = r })
    mockCommentsResolve.mockReturnValueOnce(resolveGate)
    const resolving = store.resolveThread('t1')

    // A poll starts during that window and reads the server before the PATCH commits.
    let releaseList: (v: any) => void = () => {}
    const listGate = new Promise<any>((r) => { releaseList = r })
    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1 }))
    mockCommentsList.mockReturnValueOnce(listGate)

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockCommentsList).toHaveBeenCalledTimes(1))

    releaseResolve({ resolvedAt: '2026-04-12T14:00:00.000Z', resolvedBy: 'user-1' })
    await resolving
    expect(store.threads[0].resolvedAt).toBe('2026-04-12T14:00:00.000Z')

    releaseList(commentsResponse({
      comments: [makeThread({ id: 't1', replies: undefined })],
      lastModifiedAt: '2026-04-12T12:00:00.000Z',
    }))
    await listGate
    await new Promise((r) => setTimeout(r, 0))

    expect(store.threads[0].resolvedAt).toBe('2026-04-12T14:00:00.000Z')
    store.stopPolling()
  })

  it('drops a poll response when a mutation failed while it was in flight', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [] })]
    store.lastModifiedAt = null

    let rejectResolve: (e: unknown) => void = () => {}
    const resolveGate = new Promise<any>((_r, reject) => { rejectResolve = reject })
    mockCommentsResolve.mockReturnValueOnce(resolveGate)
    const resolving = store.resolveThread('t1')

    let releaseList: (v: any) => void = () => {}
    const listGate = new Promise<any>((r) => { releaseList = r })
    mockSyncGet.mockResolvedValueOnce(syncResponse({ commentCount: 1 }))
    mockCommentsList.mockReturnValueOnce(listGate)

    store.startPolling()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(mockCommentsList).toHaveBeenCalledTimes(1))

    rejectResolve(new Error('netwerkfout'))
    await expect(resolving).rejects.toThrow('netwerkfout')

    releaseList(commentsResponse({ comments: [makeThread({ id: 't1' })], lastModifiedAt: 'NEW' }))
    await listGate
    await new Promise((r) => setTimeout(r, 0))

    // The watermark is untouched, so the next poll re-requests the same delta.
    expect(store.lastModifiedAt).toBeNull()
    store.stopPolling()
  })
})

describe('schedulePoll() timer loop', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    })
  }

  afterEach(() => setVisibility('visible'))

  it('polls when visible on each scheduled tick', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    mockSyncGet.mockResolvedValue(syncResponse({ commentCount: 0 }))
    mockCommentsList.mockResolvedValue(commentsResponse())

    vi.useFakeTimers()
    setVisibility('visible')
    store.startPolling()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockSyncGet.mock.calls.length).toBeGreaterThanOrEqual(1)
    store.stopPolling()
    vi.useRealTimers()
  })

  it('skips the poll on a scheduled tick while hidden, but reschedules', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'

    vi.useFakeTimers()
    setVisibility('hidden')
    store.startPolling()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockSyncGet).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockSyncGet).not.toHaveBeenCalled()
    store.stopPolling()
    vi.useRealTimers()
  })
})

describe('startPolling()/stopPolling()', () => {
  it('startPolling first calls stopPolling (timer/handler null branch) then arms anew', async () => {
    const store = await freshStore()
    store.startPolling()
    store.startPolling()
    store.stopPolling()
    expect(() => store.stopPolling()).not.toThrow()
  })
})

describe('createComment()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    const result = await store.createComment('field-a', 'tekst')
    expect(result).toBeUndefined()
    expect(mockCommentsCreate).not.toHaveBeenCalled()
  })

  it('pushes the created thread with provided replies', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    const created = makeThread({ id: 'c1', replies: [makeReply()] })
    mockCommentsCreate.mockResolvedValueOnce(created)

    const result = await store.createComment('field-a', 'tekst')

    expect(result).toBe(created)
    expect(store.threads).toHaveLength(1)
    expect(store.threads[0].replies).toHaveLength(1)
  })

  it('pushes the created thread with a default empty replies array', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    mockCommentsCreate.mockResolvedValueOnce(makeThread({ id: 'c2', replies: undefined }))

    await store.createComment('field-a', 'tekst')

    expect(store.threads[0].replies).toEqual([])
  })
})

describe('createReply()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    const result = await store.createReply('t1', 'field-a', 'tekst')
    expect(result).toBeUndefined()
    expect(mockCommentsCreate).not.toHaveBeenCalled()
  })

  it('appends a reply to the matching thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 'parent', replies: [] })]
    const created = makeThread({
      id: 'r-new',
      authorId: 'user-2',
      authorName: 'Noor',
      body: 'reactie',
      createdAt: 'C',
      updatedAt: 'U',
    })
    mockCommentsCreate.mockResolvedValueOnce(created)

    const result = await store.createReply('parent', 'field-a', 'reactie')

    expect(result).toBe(created)
    expect(store.threads[0].replies).toHaveLength(1)
    expect(store.threads[0].replies[0]).toMatchObject({
      id: 'r-new',
      parentId: 'parent',
      authorId: 'user-2',
      authorName: 'Noor',
      body: 'reactie',
      createdAt: 'C',
      updatedAt: 'U',
    })
  })

  it('does not append when the parent thread is missing (thread falsy branch)', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 'other', replies: [] })]
    mockCommentsCreate.mockResolvedValueOnce(makeThread({ id: 'r-new' }))

    await store.createReply('does-not-exist', 'field-a', 'reactie')

    expect(store.threads[0].replies).toHaveLength(0)
  })
})

describe('updateComment()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    await store.updateComment('t1', 'nieuw')
    expect(mockCommentsUpdate).not.toHaveBeenCalled()
  })

  it('updates a top-level thread body and timestamp', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', body: 'oud', updatedAt: 'old-ts' })]
    mockCommentsUpdate.mockResolvedValueOnce(undefined)

    await store.updateComment('t1', 'nieuwe body')

    expect(store.threads[0].body).toBe('nieuwe body')
    expect(store.threads[0].updatedAt).not.toBe('old-ts')
  })

  it('updates a reply body and timestamp', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [
      makeThread({ id: 't1', replies: [makeReply({ id: 'r1', body: 'oud', updatedAt: 'old-ts' })] }),
    ]
    mockCommentsUpdate.mockResolvedValueOnce(undefined)

    await store.updateComment('r1', 'nieuwe reply')

    expect(store.threads[0].replies[0].body).toBe('nieuwe reply')
    expect(store.threads[0].replies[0].updatedAt).not.toBe('old-ts')
  })

  it('does nothing when the comment id matches neither a thread nor a reply', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', body: 'oud', replies: [makeReply({ id: 'r1' })] })]
    mockCommentsUpdate.mockResolvedValueOnce(undefined)

    await store.updateComment('onbekend', 'nieuw')

    expect(store.threads[0].body).toBe('oud')
  })
})

describe('deleteComment()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    await store.deleteComment('t1')
    expect(mockCommentsDelete).not.toHaveBeenCalled()
  })

  it('removes a top-level thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1' }), makeThread({ id: 't2' })]
    mockCommentsDelete.mockResolvedValueOnce(undefined)

    await store.deleteComment('t1')

    expect(store.threads.map((t) => t.id)).toEqual(['t2'])
  })

  it('removes a reply when the id is not a top-level thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [
      makeThread({ id: 't1', replies: [makeReply({ id: 'r1' }), makeReply({ id: 'r2' })] }),
    ]
    mockCommentsDelete.mockResolvedValueOnce(undefined)

    await store.deleteComment('r1')

    expect(store.threads[0].replies.map((r) => r.id)).toEqual(['r2'])
  })

  it('does nothing when the id matches neither a thread nor a reply', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', replies: [makeReply({ id: 'r1' })] })]
    mockCommentsDelete.mockResolvedValueOnce(undefined)

    await store.deleteComment('onbekend')

    expect(store.threads).toHaveLength(1)
    expect(store.threads[0].replies).toHaveLength(1)
  })
})

describe('resolveThread()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    await store.resolveThread('t1')
    expect(mockCommentsResolve).not.toHaveBeenCalled()
  })

  it('applies resolvedAt/resolvedBy to the matching thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1' })]
    mockCommentsResolve.mockResolvedValueOnce({ resolvedAt: 'R-TS', resolvedBy: 'user-3' })

    await store.resolveThread('t1')

    expect(store.threads[0].resolvedAt).toBe('R-TS')
    expect(store.threads[0].resolvedBy).toBe('user-3')
  })

  it('does nothing when the thread is missing (thread falsy branch)', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 'other' })]
    mockCommentsResolve.mockResolvedValueOnce({ resolvedAt: 'R-TS', resolvedBy: 'user-3' })

    await store.resolveThread('onbekend')

    expect(store.threads[0].resolvedAt).toBeNull()
  })
})

describe('reopenThread()', () => {
  it('returns early without an assessmentId', async () => {
    const store = await freshStore()
    await store.reopenThread('t1')
    expect(mockCommentsReopen).not.toHaveBeenCalled()
  })

  it('clears resolvedAt/resolvedBy on the matching thread', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 't1', resolvedAt: 'R', resolvedBy: 'user-3' })]
    mockCommentsReopen.mockResolvedValueOnce(undefined)

    await store.reopenThread('t1')

    expect(store.threads[0].resolvedAt).toBeNull()
    expect(store.threads[0].resolvedBy).toBeNull()
  })

  it('does nothing when the thread is missing (thread falsy branch)', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread({ id: 'other', resolvedAt: 'R' })]
    mockCommentsReopen.mockResolvedValueOnce(undefined)

    await store.reopenThread('onbekend')

    expect(store.threads[0].resolvedAt).toBe('R')
  })
})

describe('reset()', () => {
  it('clears every field and stops polling', async () => {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    store.threads = [makeThread()]
    store.lastModifiedAt = 'TS'
    store.assessmentVersion = 9
    store.assessmentUpdatedAt = 'U'
    store.lastModifiedBySelf = false
    store.currentUserId = 'user-1'
    store.loading = true
    store.error = 'boem'
    store.startPolling()

    store.reset()

    expect(store.assessmentId).toBeNull()
    expect(store.threads).toHaveLength(0)
    expect(store.lastModifiedAt).toBeNull()
    expect(store.assessmentVersion).toBeNull()
    expect(store.assessmentUpdatedAt).toBeNull()
    expect(store.lastModifiedBySelf).toBe(true)
    expect(store.currentUserId).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })
})

describe('syncFailing — reporting a sync that stays stuck', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    })
  }

  afterEach(() => {
    setVisibility('visible')
    vi.useRealTimers()
  })

  async function pollingStore() {
    const store = await freshStore()
    store.assessmentId = 'assessment-1'
    vi.useFakeTimers()
    setVisibility('visible')
    store.startPolling()
    return store
  }

  it('stays quiet while a single poll fails, since the next one heals it', async () => {
    mockSyncGet.mockRejectedValue(new Error('netwerk weg'))
    const store = await pollingStore()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(store.syncFailing).toBe(false)
    store.stopPolling()
  })

  it('reports failing after three consecutive failed polls', async () => {
    mockSyncGet.mockRejectedValue(new Error('netwerk weg'))
    const store = await pollingStore()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(store.syncFailing).toBe(true)
    store.stopPolling()
  })

  it('clears the failure state as soon as a poll succeeds', async () => {
    mockSyncGet.mockRejectedValue(new Error('netwerk weg'))
    const store = await pollingStore()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.syncFailing).toBe(true)

    mockSyncGet.mockResolvedValue(syncResponse({ commentCount: 0 }))
    mockCommentsList.mockResolvedValue(commentsResponse())
    await vi.advanceTimersByTimeAsync(10_000)

    expect(store.syncFailing).toBe(false)
    store.stopPolling()
  })

  it('honours Retry-After on a 429 instead of hammering every 10 seconds', async () => {
    mockSyncGet.mockRejectedValue(new FakeApiError('Te veel verzoeken', 429, 30))
    const store = await pollingStore()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockSyncGet).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(mockSyncGet).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockSyncGet).toHaveBeenCalledTimes(2)
    store.stopPolling()
  })
})

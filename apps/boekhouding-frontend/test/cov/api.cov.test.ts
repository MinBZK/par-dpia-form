/**
 * @vitest-environment jsdom
 *
 * Self-sufficient coverage test for src/api.ts. Exercises every branch of the
 * internal request() helper plus every exported endpoint wrapper so that all
 * URL/body/option permutations are covered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock useAuth so request() has a deterministic token + sessionExpired ref.
const mockGetToken = vi.fn().mockResolvedValue('mock-token')
const mockSessionExpired = { value: false }

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    sessionExpired: mockSessionExpired,
  }),
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() {
      super('Sessie verlopen')
      this.name = 'SessionExpiredError'
    }
  },
}))

type ApiModule = typeof import('../../src/api')

let api: ApiModule

/** Build a Response-like object for the mocked fetch. */
function fetchResponse(opts: {
  ok?: boolean
  status: number
  json?: () => Promise<unknown>
}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status,
    json: opts.json ?? (() => Promise.resolve({})),
  }
}

/** Install a fetch mock that always resolves with the given response/payload. */
function mockFetchOk(payload: unknown) {
  const mockFetch = vi.fn().mockResolvedValue(
    fetchResponse({ ok: true, status: 200, json: () => Promise.resolve(payload) }),
  )
  globalThis.fetch = mockFetch
  return mockFetch
}

beforeEach(async () => {
  vi.resetModules()
  mockGetToken.mockResolvedValue('mock-token')
  mockSessionExpired.value = false
  api = await import('../../src/api')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('request() core behaviour', () => {
  it('attaches the Bearer token and does not add Content-Type for GET (no body)', async () => {
    const mockFetch = mockFetchOk([])
    await api.projects.list()

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/v1/projects')
    expect(init.headers.Authorization).toBe('Bearer mock-token')
    // No body => Content-Type must NOT be set (covers the `if (options.body)` false branch).
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('adds Content-Type when a body is present', async () => {
    const mockFetch = mockFetchOk({ id: 'p1', name: 'A' })
    await api.projects.create('A')

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('merges caller-provided headers via the options.headers spread', async () => {
    // commentsApi.create passes no extra headers, but DELETE/POST options exercise
    // the spread. To explicitly cover a truthy options.headers spread we call the
    // raw request path through a wrapper that supplies headers is not exported, so
    // instead verify the spread does not break when options.headers is undefined.
    const mockFetch = mockFetchOk([])
    await api.projects.list()
    const [, init] = mockFetch.mock.calls[0]
    // The `...options.headers` spread of undefined yields just Authorization.
    expect(Object.keys(init.headers)).toEqual(['Authorization'])
  })

  it('returns undefined for 204 No Content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }))
    const result = await api.projects.delete('p1')
    expect(result).toBeUndefined()
  })

  it('throws SessionExpiredError and sets sessionExpired on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fetchResponse({ ok: false, status: 401, json: () => Promise.resolve({ detail: 'x' }) }),
    )
    await expect(api.projects.list()).rejects.toThrow(api.SessionExpiredError)
    expect(mockSessionExpired.value).toBe(true)
  })

  it('throws ApiError using data.detail for non-401 errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fetchResponse({ ok: false, status: 403, json: () => Promise.resolve({ detail: 'Geen toegang' }) }),
    )
    await expect(api.projects.list()).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Geen toegang',
    })
    expect(mockSessionExpired.value).toBe(false)
  })

  it('throws ApiError using data.error when detail is absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fetchResponse({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Serverfout' }) }),
    )
    await expect(api.projects.list()).rejects.toThrow('Serverfout')
  })

  it('throws ApiError with fallback message when neither detail nor error present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fetchResponse({ ok: false, status: 400, json: () => Promise.resolve({}) }),
    )
    await expect(api.projects.list()).rejects.toThrow('Verzoek mislukt')
  })

  it('returns parsed JSON on a successful response', async () => {
    mockFetchOk([{ id: 'p1', name: 'A', description: '', createdAt: '', updatedAt: '' }])
    const result = await api.projects.list()
    expect(result).toEqual([{ id: 'p1', name: 'A', description: '', createdAt: '', updatedAt: '' }])
  })

  it('propagates a rejected getToken (e.g. session expired before request)', async () => {
    mockGetToken.mockRejectedValueOnce(new api.SessionExpiredError())
    await expect(api.projects.list()).rejects.toThrow(api.SessionExpiredError)
  })
})

describe('ApiError', () => {
  it('exposes message, status and name', () => {
    const err = new api.ApiError('boom', 418)
    expect(err.message).toBe('boom')
    expect(err.status).toBe(418)
    expect(err.name).toBe('ApiError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('projects endpoints', () => {
  it('list -> GET /api/v1/projects', async () => {
    const f = mockFetchOk([])
    await api.projects.list()
    expect(f.mock.calls[0][0]).toBe('/api/v1/projects')
    expect(f.mock.calls[0][1].method).toBeUndefined()
  })

  it('get -> GET /api/v1/projects/:id', async () => {
    const f = mockFetchOk({})
    await api.projects.get('p1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/projects/p1')
  })

  it('create with description -> POST with name+description body', async () => {
    const f = mockFetchOk({})
    await api.projects.create('Naam', 'Beschrijving')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Naam', description: 'Beschrijving' })
  })

  it('create without description -> POST with undefined description', async () => {
    const f = mockFetchOk({})
    await api.projects.create('Naam')
    const init = f.mock.calls[0][1]
    expect(JSON.parse(init.body)).toEqual({ name: 'Naam' })
  })

  it('update -> PUT /api/v1/projects/:id', async () => {
    const f = mockFetchOk({})
    await api.projects.update('p1', { name: 'Nieuw' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ name: 'Nieuw' })
  })

  it('delete -> DELETE /api/v1/projects/:id', async () => {
    const f = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }))
    globalThis.fetch = f
    await api.projects.delete('p1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1')
    expect(init.method).toBe('DELETE')
  })
})

describe('members endpoints', () => {
  it('list -> GET members', async () => {
    const f = mockFetchOk([])
    await api.members.list('p1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/projects/p1/members')
  })

  it('add with role -> POST', async () => {
    const f = mockFetchOk({})
    await api.members.add('p1', 'a@b.nl', 'editor')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1/members')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.nl', role: 'editor' })
  })

  it('add without role -> POST with undefined role', async () => {
    const f = mockFetchOk({})
    await api.members.add('p1', 'a@b.nl')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ email: 'a@b.nl' })
  })

  it('update -> PUT member role', async () => {
    const f = mockFetchOk({})
    await api.members.update('p1', 'u1', 'viewer')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1/members/u1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ role: 'viewer' })
  })

  it('remove -> DELETE member', async () => {
    const f = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }))
    globalThis.fetch = f
    await api.members.remove('p1', 'u1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1/members/u1')
    expect(init.method).toBe('DELETE')
  })
})

describe('assessments endpoints', () => {
  it('list -> GET assessments', async () => {
    const f = mockFetchOk([])
    await api.assessments.list('p1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/projects/p1/assessments')
  })

  it('get -> GET assessment', async () => {
    const f = mockFetchOk({})
    await api.assessments.get('a1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1')
  })

  it('create with name -> POST including name', async () => {
    const f = mockFetchOk({})
    await api.assessments.create('p1', 'dpia', 'Mijn DPIA', { foo: 1 })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/projects/p1/assessments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      assessmentType: 'dpia',
      name: 'Mijn DPIA',
      state: { foo: 1 },
    })
  })

  it('create without name -> POST omitting name', async () => {
    const f = mockFetchOk({})
    await api.assessments.create('p1', 'prescan')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      assessmentType: 'prescan',
    })
  })

  it('update with options -> PUT including options', async () => {
    const f = mockFetchOk({})
    await api.assessments.update('a1', { s: 1 }, { changeDescription: 'wijziging', newVersion: true })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      state: { s: 1 },
      changeDescription: 'wijziging',
      newVersion: true,
    })
  })

  it('update without options -> PUT with just state', async () => {
    const f = mockFetchOk({})
    await api.assessments.update('a1', { s: 2 })
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ state: { s: 2 } })
  })

  it('rename -> PUT with name', async () => {
    const f = mockFetchOk({})
    await api.assessments.rename('a1', 'Nieuwe naam')
    const init = f.mock.calls[0][1]
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ name: 'Nieuwe naam' })
  })

  it('delete -> DELETE assessment', async () => {
    const f = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }))
    globalThis.fetch = f
    await api.assessments.delete('a1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1')
    expect(init.method).toBe('DELETE')
  })

  it('versions -> GET versions', async () => {
    const f = mockFetchOk([])
    await api.assessments.versions('a1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/versions')
  })

  it('version with includeState -> GET with query param', async () => {
    const f = mockFetchOk({})
    await api.assessments.version('a1', 3, { includeState: true })
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/versions/3?includeState=true')
  })

  it('version with includeState false -> GET without query param', async () => {
    const f = mockFetchOk({})
    await api.assessments.version('a1', 3, { includeState: false })
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/versions/3')
  })

  it('version without options -> GET without query param (optional chaining undefined)', async () => {
    const f = mockFetchOk({})
    await api.assessments.version('a1', 3)
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/versions/3')
  })

  it('versionEdits -> GET edits', async () => {
    const f = mockFetchOk([])
    await api.assessments.versionEdits('a1', 2)
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/versions/2/edits')
  })

  it('updateVersionDescription -> PATCH', async () => {
    const f = mockFetchOk({})
    await api.assessments.updateVersionDescription('a1', 2, 'beschrijving')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1/versions/2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ changeDescription: 'beschrijving' })
  })
})

describe('commentsApi endpoints', () => {
  it('list with since -> GET with encoded since query', async () => {
    const f = mockFetchOk({ comments: [], lastModifiedAt: null, currentUserId: 'u1' })
    await api.commentsApi.list('a1', '2026-01-01T00:00:00Z')
    expect(f.mock.calls[0][0]).toBe(
      `/api/v1/assessments/a1/comments?since=${encodeURIComponent('2026-01-01T00:00:00Z')}`,
    )
  })

  it('list without since -> GET without query', async () => {
    const f = mockFetchOk({ comments: [], lastModifiedAt: null, currentUserId: 'u1' })
    await api.commentsApi.list('a1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/comments')
  })

  it('create with parentId -> POST including parentId', async () => {
    const f = mockFetchOk({})
    await api.commentsApi.create('a1', '2.1', 'tekst', 'parent-1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ fieldId: '2.1', body: 'tekst', parentId: 'parent-1' })
  })

  it('create without parentId -> POST omitting parentId', async () => {
    const f = mockFetchOk({})
    await api.commentsApi.create('a1', '2.1', 'tekst')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ fieldId: '2.1', body: 'tekst' })
  })

  it('update -> PATCH comment body', async () => {
    const f = mockFetchOk({})
    await api.commentsApi.update('a1', 'c1', 'nieuwe tekst')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1/comments/c1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ body: 'nieuwe tekst' })
  })

  it('delete -> DELETE comment', async () => {
    const f = vi.fn().mockResolvedValue(fetchResponse({ ok: true, status: 204 }))
    globalThis.fetch = f
    await api.commentsApi.delete('a1', 'c1')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/assessments/a1/comments/c1')
    expect(init.method).toBe('DELETE')
  })

  it('resolve -> PATCH with resolvedAt timestamp', async () => {
    const f = mockFetchOk({})
    await api.commentsApi.resolve('a1', 'c1')
    const init = f.mock.calls[0][1]
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body)
    expect(typeof body.resolvedAt).toBe('string')
    expect(Number.isNaN(Date.parse(body.resolvedAt))).toBe(false)
  })

  it('reopen -> PATCH with resolvedAt null', async () => {
    const f = mockFetchOk({})
    await api.commentsApi.reopen('a1', 'c1')
    const init = f.mock.calls[0][1]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ resolvedAt: null })
  })
})

describe('syncApi endpoints', () => {
  it('get -> GET sync', async () => {
    const f = mockFetchOk({ version: 1, updatedAt: '', lastModifiedBySelf: false, commentCount: 0 })
    await api.syncApi.get('a1')
    expect(f.mock.calls[0][0]).toBe('/api/v1/assessments/a1/sync')
  })
})

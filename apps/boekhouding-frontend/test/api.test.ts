/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock useAuth
const mockGetToken = vi.fn().mockResolvedValue('mock-token')
const mockSessionExpired = { value: false }

vi.mock('../src/composables/useAuth', () => ({
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

let ApiError: typeof import('../src/api').ApiError
let SessionExpiredError: typeof import('../src/api').SessionExpiredError

beforeEach(async () => {
  vi.resetModules()
  mockGetToken.mockResolvedValue('mock-token')
  mockSessionExpired.value = false

  const mod = await import('../src/api')
  // Access request indirectly through the exported API functions
  ApiError = mod.ApiError
  SessionExpiredError = mod.SessionExpiredError

  // We'll test through the projects.list() endpoint as a proxy for request()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API request()', () => {
  it('attaches Bearer token to requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    })
    globalThis.fetch = mockFetch

    const { projects } = await import('../src/api')
    await projects.list()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      }),
    )
  })

  it('throws SessionExpiredError when getToken() fails', async () => {
    const { SessionExpiredError: SE } = await import('../src/composables/useAuth')
    mockGetToken.mockRejectedValueOnce(new SE())

    const { projects } = await import('../src/api')
    await expect(projects.list()).rejects.toThrow('Sessie verlopen')
  })

  it('throws SessionExpiredError on 401 response and sets sessionExpired', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Ongeldig token' }),
    })

    const { projects } = await import('../src/api')
    await expect(projects.list()).rejects.toThrow('Sessie verlopen')
    expect(mockSessionExpired.value).toBe(true)
  })

  it('throws ApiError for non-401 error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'Geen toegang' }),
    })

    const { projects, ApiError } = await import('../src/api')
    await expect(projects.list()).rejects.toThrow(ApiError)
    await expect(projects.list()).rejects.toThrow('Geen toegang')
    // sessionExpired should NOT be set for 403
    expect(mockSessionExpired.value).toBe(false)
  })

  it('returns undefined for 204 No Content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    })

    const { projects } = await import('../src/api')
    const result = await projects.delete('test-id')
    expect(result).toBeUndefined()
  })
})

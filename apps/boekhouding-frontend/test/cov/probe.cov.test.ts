/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { probe, TimeoutError } from '../../src/probe'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('probe', () => {
  it('resolves with the fetch Response when fetch succeeds before the timeout', async () => {
    const response = { ok: true } as Response
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    const res = await probe('/api/health')

    expect(res).toBe(response)
    expect(fetchMock).toHaveBeenCalledWith('/api/health')
  })

  it('rejects with the original error when fetch fails before the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))

    await expect(probe('/api/health', 5000)).rejects.toThrow('connection refused')
  })

  it('rejects with a TimeoutError when fetch does not resolve before the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => {})))

    const pending = probe('/api/health', 100)
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })
})

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

type VersionModule = typeof import('../../src/version')

async function fresh(): Promise<VersionModule> {
  vi.resetModules()
  return import('../../src/version')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('version', () => {
  it('returns the parsed JSON from /version.json on success', async () => {
    const payload = { version: 'v2026.6.14', commit: 'abc1234', channel: 'productie' }
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) })
    vi.stubGlobal('fetch', fetchMock)

    const { loadVersion } = await fresh()
    const result = await loadVersion()

    expect(fetchMock).toHaveBeenCalledWith('/version.json')
    expect(result).toEqual(payload)
  })

  it('falls back to the dev placeholder when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { loadVersion } = await fresh()

    expect(await loadVersion()).toEqual({ version: 'dev', commit: 'dev', channel: 'dev' })
  })

  it('falls back to the dev placeholder when the response body is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.reject(new Error('bad json')),
    }))

    const { loadVersion } = await fresh()

    expect(await loadVersion()).toEqual({ version: 'dev', commit: 'dev', channel: 'dev' })
  })
})

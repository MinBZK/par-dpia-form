import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAsset, _assetRegistry, _registerAsset } from '../../src/services/assetsRegistry'

// Each scenario uses a distinct font filename: getAsset() mutates the shared
// _assetRegistry, so reusing one filename would leak state between tests.

const BOLD = 'rijksoverheidsanstext-bold-webfont.ttf'
const ITALIC = 'rijksoverheidsanstext-italic-webfont.ttf'
const REGULAR = 'rijksoverheidsanstext-regular-webfont.ttf'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('module initialization', () => {
  it('registers the bundled font assets as dev URLs', () => {
    expect(_assetRegistry[BOLD]).toMatch(/^\/.*\.ttf$/)
    expect(_assetRegistry[ITALIC]).toMatch(/^\/.*\.ttf$/)
    expect(_assetRegistry[REGULAR]).toMatch(/^\/.*\.ttf$/)
  })
})

describe('_registerAsset — dev vs production registration', () => {
  it('dev URL: keeps the path so getAsset can lazily fetch it (dev arm)', async () => {
    _registerAsset('di-dev.ttf', '/src/assets/fonts/di-dev.ttf', true)
    expect(_assetRegistry['di-dev.ttf']).toBe('/src/assets/fonts/di-dev.ttf')

    const fetchMock = vi.fn(async (_url: string) => ({
      blob: async () => new Blob(['x'], { type: 'font/ttf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await getAsset('di-dev.ttf')
    expect(fetchMock).toHaveBeenCalledWith('/src/assets/fonts/di-dev.ttf')

    delete _assetRegistry['di-dev.ttf']
  })

  it('production URL: stores the inline/hashed url directly, no path recorded (non-dev arm)', async () => {
    _registerAsset('di-prod.ttf', 'data:font/ttf;base64,UFJPRA==', false)
    expect(_assetRegistry['di-prod.ttf']).toBe('data:font/ttf;base64,UFJPRA==')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await getAsset('di-prod.ttf')).toBe('UFJPRA==')
    expect(fetchMock).not.toHaveBeenCalled()

    delete _assetRegistry['di-prod.ttf']
  })
})

describe('getAsset — unknown asset', () => {
  it('returns undefined when the filename is not in the registry (!asset branch)', async () => {
    await expect(getAsset('does-not-exist.ttf')).resolves.toBeUndefined()
  })
})

describe('getAsset — dev asset happy path', () => {
  it('fetches, base64-encodes, rewrites the registry and returns the base64 payload', async () => {
    const devPath = _assetRegistry[BOLD] as string
    const fetchMock = vi.fn(async (_url: string) => ({
      blob: async () => new Blob(['hello'], { type: 'font/ttf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getAsset(BOLD)

    expect(result).toBe('aGVsbG8=')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(devPath)
    expect(_assetRegistry[BOLD]).toBe('data:font/ttf;base64,aGVsbG8=')
  })

  it('takes the non-dev branch on a second call (entry already a data URL)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await getAsset(BOLD)

    expect(result).toBe('aGVsbG8=')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('_fetchAndEncode — concurrent calls share one promise', () => {
  it('reuses the in-flight fetch promise for the same URL (pendingFetch branch)', async () => {
    // Hold the blob back until both calls have launched, so the second observes
    // the cached pending promise rather than starting its own fetch.
    let resolveBlob!: (b: Blob) => void
    const blobReady = new Promise<Blob>((res) => {
      resolveBlob = res
    })
    const fetchMock = vi.fn(async (_url: string) => ({
      blob: () => blobReady,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const p1 = getAsset(ITALIC)
    const p2 = getAsset(ITALIC)

    resolveBlob(new Blob(['hi'], { type: 'font/ttf' }))

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('aGk=')
    expect(r2).toBe('aGk=')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('_fetchAndEncode — fetch failure', () => {
  it('logs the error, resolves to empty string, so getAsset yields undefined (catch branch)', async () => {
    const error = new Error('network down')
    const fetchMock = vi.fn(async () => {
      throw error
    })
    vi.stubGlobal('fetch', fetchMock)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getAsset(REGULAR)

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch and encode asset'),
      error,
    )
    expect(_assetRegistry[REGULAR]).toBe('')

    consoleSpy.mockRestore()
  })
})

describe('getAsset — dev entry without a stored file path', () => {
  it('returns undefined when the registry holds a dev URL but _filePaths lacks it (!path branch)', async () => {
    // Inject straight into _assetRegistry, bypassing _registerAsset, so _filePaths
    // has no entry for this filename and getAsset hits its `if (!path)` guard.
    const orphan = 'orphan-dev-asset.ttf'
    _assetRegistry[orphan] = '/src/assets/fonts/orphan-dev-asset.ttf'

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await getAsset(orphan)

    expect(result).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()

    delete _assetRegistry[orphan]
  })
})

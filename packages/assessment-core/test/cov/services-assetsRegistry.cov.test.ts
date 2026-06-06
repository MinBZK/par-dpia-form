import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAsset, _assetRegistry, _registerAsset } from '../../src/services/assetsRegistry'

/**
 * Self-sufficient coverage suite for src/services/assetsRegistry.ts.
 *
 * The module eagerly resolves `import.meta.glob` at import time. In the vitest
 * environment Vite resolves the bundled `.ttf` font assets to dev-mode URLs
 * (they start with "/"), so the registry initially holds three dev URLs:
 *   rijksoverheidsanstext-{bold,italic,regular}-webfont.ttf -> /src/assets/...
 *
 * getAsset() lazily fetches a dev asset, base64-encodes it via FileReader, and
 * rewrites the registry entry with the resulting `data:` URL. After that first
 * call the entry no longer starts with "/", which exercises the non-dev branch
 * on a subsequent call. fetch/FileReader/Blob are all provided by jsdom.
 *
 * To keep tests independent we use a different font filename per scenario so
 * one test's registry mutation does not leak into another.
 */

const BOLD = 'rijksoverheidsanstext-bold-webfont.ttf'
const ITALIC = 'rijksoverheidsanstext-italic-webfont.ttf'
const REGULAR = 'rijksoverheidsanstext-regular-webfont.ttf'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('module initialization', () => {
  it('registers the bundled font assets as dev URLs', () => {
    // The forEach over import.meta.glob populated the registry. In test mode
    // every URL is a dev URL (starts with "/").
    expect(_assetRegistry[BOLD]).toMatch(/^\/.*\.ttf$/)
    expect(_assetRegistry[ITALIC]).toMatch(/^\/.*\.ttf$/)
    expect(_assetRegistry[REGULAR]).toMatch(/^\/.*\.ttf$/)
  })
})

describe('_registerAsset — dev vs production registration', () => {
  it('dev URL: keeps the path so getAsset can lazily fetch it (dev arm)', async () => {
    _registerAsset('di-dev.ttf', '/src/assets/fonts/di-dev.ttf', true)
    expect(_assetRegistry['di-dev.ttf']).toBe('/src/assets/fonts/di-dev.ttf')

    // It's a dev URL, so getAsset fetches via the path stored by the dev arm.
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

    // Not a dev URL → getAsset returns the payload directly, never fetching.
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
    const devPath = _assetRegistry[BOLD] as string // dev URL stored at init
    // "hello" -> base64 "aGVsbG8="
    const fetchMock = vi.fn(async (_url: string) => ({
      blob: async () => new Blob(['hello'], { type: 'font/ttf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getAsset(BOLD)

    // The returned value is the part of the data URL after the comma.
    expect(result).toBe('aGVsbG8=')
    // fetch was called once, with the dev path the module recorded for BOLD.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(devPath)
    // The registry entry was rewritten to the full data URL (no longer dev).
    expect(_assetRegistry[BOLD]).toBe('data:font/ttf;base64,aGVsbG8=')
  })

  it('takes the non-dev branch on a second call (entry already a data URL)', async () => {
    // BOLD was rewritten to a data: URL by the previous test, so it no longer
    // starts with "/". A second call must NOT fetch again and must return the
    // cached base64 payload directly.
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await getAsset(BOLD)

    expect(result).toBe('aGVsbG8=')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('_fetchAndEncode — concurrent calls share one promise', () => {
  it('reuses the in-flight fetch promise for the same URL (pendingFetch branch)', async () => {
    // Hold the blob back until both getAsset calls have launched, guaranteeing
    // the second call observes the cached pending promise (return pendingFetch).
    let resolveBlob!: (b: Blob) => void
    const blobReady = new Promise<Blob>((res) => {
      resolveBlob = res
    })
    const fetchMock = vi.fn(async (_url: string) => ({
      blob: () => blobReady,
    }))
    vi.stubGlobal('fetch', fetchMock)

    // Both calls target the same (still dev) ITALIC asset within the same tick.
    const p1 = getAsset(ITALIC)
    const p2 = getAsset(ITALIC)

    // Now let the underlying fetch/FileReader complete.
    resolveBlob(new Blob(['hi'], { type: 'font/ttf' }))

    const [r1, r2] = await Promise.all([p1, p2])

    // "hi" -> base64 "aGk="
    expect(r1).toBe('aGk=')
    expect(r2).toBe('aGk=')
    // Only one network fetch happened despite two concurrent getAsset calls.
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

    // _fetchAndEncode resolved '' on error; ''.split(',')[1] is undefined.
    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch and encode asset'),
      error,
    )
    // The registry entry was rewritten to the empty string returned on error.
    expect(_assetRegistry[REGULAR]).toBe('')

    consoleSpy.mockRestore()
  })
})

describe('getAsset — dev entry without a stored file path', () => {
  it('returns undefined when the registry holds a dev URL but _filePaths lacks it (!path branch)', async () => {
    // Inject a dev-style registry entry for a filename that was never indexed
    // into _filePaths (only the three bundled fonts are). This drives the
    // `if (!path) return undefined` guard inside getAsset.
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

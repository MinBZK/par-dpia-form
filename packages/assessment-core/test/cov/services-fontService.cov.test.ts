import { describe, it, expect, beforeEach, vi } from 'vitest'

// The font service keeps module-level state (initialized / isLoading /
// loadPromise / fonts / vfs). We mock getAsset so we control what each font
// file resolves to, and reset modules between tests to start from a clean
// (uninitialized) state for each scenario.

const getAssetMock = vi.fn<(filename: string) => Promise<string | undefined>>()

vi.mock('../../src/services/assetsRegistry', () => ({
  getAsset: (filename: string) => getAssetMock(filename),
}))

async function importFontService() {
  vi.resetModules()
  const mod = await import('../../src/services/fontService')
  return mod.default
}

const FONT_FILES = [
  'rijksoverheidsanstext-regular-webfont.ttf',
  'rijksoverheidsanstext-bold-webfont.ttf',
  'rijksoverheidsanstext-italic-webfont.ttf',
]

describe('FontService', () => {
  beforeEach(() => {
    getAssetMock.mockReset()
  })

  describe('getFonts', () => {
    it('loads fonts on first call (initialized branch false) and maps variants to pdfMake keys', async () => {
      getAssetMock.mockImplementation(async (filename: string) => `data-for-${filename}`)
      const FontService = await importFontService()

      const fonts = await FontService.getFonts()

      expect(fonts).toHaveProperty('rijksoverheidsanstext')
      const family = fonts.rijksoverheidsanstext
      expect(family.normal).toBe('rijksoverheidsanstext-regular-webfont.ttf')
      expect(family.bold).toBe('rijksoverheidsanstext-bold-webfont.ttf')
      expect(family.italics).toBe('rijksoverheidsanstext-italic-webfont.ttf')
      // bolditalics is explicitly set to the bold variant.
      expect(family.bolditalics).toBe('rijksoverheidsanstext-bold-webfont.ttf')

      // getAsset is called once per font variant.
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
      for (const file of FONT_FILES) {
        expect(getAssetMock).toHaveBeenCalledWith(file)
      }
    })

    it('does not reload on a second call (initialized branch true)', async () => {
      getAssetMock.mockImplementation(async (filename: string) => `data-for-${filename}`)
      const FontService = await importFontService()

      await FontService.getFonts()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)

      // Second call must hit the `initialized === true` short-circuit and not
      // call getAsset again.
      const fonts = await FontService.getFonts()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
      expect(fonts).toHaveProperty('rijksoverheidsanstext')
    })
  })

  describe('getVFS', () => {
    it('builds the VFS with the encoded asset for each font file when assets resolve truthy', async () => {
      getAssetMock.mockImplementation(async (filename: string) => `encoded-${filename}`)
      const FontService = await importFontService()

      const vfs = await FontService.getVFS()

      for (const file of FONT_FILES) {
        expect(vfs[file]).toBe(`encoded-${file}`)
      }
      expect(Object.keys(vfs)).toHaveLength(FONT_FILES.length)
    })

    it('omits font files from the VFS when getAsset resolves falsy (asset branch false)', async () => {
      // Returning undefined exercises the `if (asset)` false branch: the file
      // is registered in the font definitions but not added to the VFS.
      getAssetMock.mockResolvedValue(undefined)
      const FontService = await importFontService()

      const vfs = await FontService.getVFS()
      const fonts = await FontService.getFonts()

      expect(Object.keys(vfs)).toHaveLength(0)
      // Font definitions are still built even though no VFS entries exist.
      expect(fonts.rijksoverheidsanstext.normal).toBe(
        'rijksoverheidsanstext-regular-webfont.ttf',
      )
    })

    it('does not reload on a second call (already initialized short-circuit)', async () => {
      getAssetMock.mockImplementation(async (filename: string) => `encoded-${filename}`)
      const FontService = await importFontService()

      await FontService.getVFS()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)

      // Already initialized: the `!initialized && !isLoading` guard is false.
      const vfs = await FontService.getVFS()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
      expect(Object.keys(vfs)).toHaveLength(FONT_FILES.length)
    })
  })

  describe('_loadFonts concurrency', () => {
    it('reuses the in-flight load promise for concurrent callers (isLoading && loadPromise branch true)', async () => {
      // Make getAsset hang until we release it, so a load stays in flight while
      // we issue a second concurrent call.
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      getAssetMock.mockImplementation(async (filename: string) => {
        await gate
        return `encoded-${filename}`
      })

      const FontService = await importFontService()

      // First call starts the load and parks on the gate inside getAsset.
      const firstPromise = FontService.getFonts()
      // Yield so _loadFonts sets isLoading = true and assigns loadPromise.
      await Promise.resolve()
      // Second call must observe isLoading && loadPromise and reuse it.
      const secondPromise = FontService.getFonts()

      release()

      const [first, second] = await Promise.all([firstPromise, secondPromise])
      expect(first).toBe(second)
      // getAsset is only invoked once per file despite two concurrent callers.
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
    })

    it('clears loading state via finally when _doLoadFonts rejects', async () => {
      const boom = new Error('asset blew up')
      getAssetMock.mockRejectedValueOnce(boom)

      const FontService = await importFontService()

      // The rejection propagates; the finally block must still reset isLoading
      // and loadPromise so a later call can retry.
      await expect(FontService.getFonts()).rejects.toThrow('asset blew up')

      // After failure we are not initialized; a retry re-runs the load. This
      // call now succeeds, proving loading state was cleared in finally.
      getAssetMock.mockImplementation(async (filename: string) => `retry-${filename}`)
      const fonts = await FontService.getFonts()
      expect(fonts.rijksoverheidsanstext.normal).toBe(
        'rijksoverheidsanstext-regular-webfont.ttf',
      )
    })
  })
})

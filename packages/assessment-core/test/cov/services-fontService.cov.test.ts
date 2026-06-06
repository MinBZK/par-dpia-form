import { describe, it, expect, beforeEach, vi } from 'vitest'

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
      expect(family.bolditalics).toBe('rijksoverheidsanstext-bold-webfont.ttf')

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
      getAssetMock.mockResolvedValue(undefined)
      const FontService = await importFontService()

      const vfs = await FontService.getVFS()
      const fonts = await FontService.getFonts()

      expect(Object.keys(vfs)).toHaveLength(0)
      expect(fonts.rijksoverheidsanstext.normal).toBe(
        'rijksoverheidsanstext-regular-webfont.ttf',
      )
    })

    it('does not reload on a second call (already initialized short-circuit)', async () => {
      getAssetMock.mockImplementation(async (filename: string) => `encoded-${filename}`)
      const FontService = await importFontService()

      await FontService.getVFS()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)

      const vfs = await FontService.getVFS()
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
      expect(Object.keys(vfs)).toHaveLength(FONT_FILES.length)
    })
  })

  describe('_loadFonts concurrency', () => {
    it('reuses the in-flight load promise for concurrent callers (isLoading && loadPromise branch true)', async () => {
      // Gate getAsset so the load stays in flight; without it the first call
      // would complete before the second observes the in-flight promise.
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      getAssetMock.mockImplementation(async (filename: string) => {
        await gate
        return `encoded-${filename}`
      })

      const FontService = await importFontService()

      const firstPromise = FontService.getFonts()
      // Yield so _loadFonts sets isLoading and assigns loadPromise before the second call.
      await Promise.resolve()
      const secondPromise = FontService.getFonts()

      release()

      const [first, second] = await Promise.all([firstPromise, secondPromise])
      expect(first).toBe(second)
      expect(getAssetMock).toHaveBeenCalledTimes(FONT_FILES.length)
    })

    it('clears loading state via finally when _doLoadFonts rejects', async () => {
      const boom = new Error('asset blew up')
      getAssetMock.mockRejectedValueOnce(boom)

      const FontService = await importFontService()

      await expect(FontService.getFonts()).rejects.toThrow('asset blew up')

      getAssetMock.mockImplementation(async (filename: string) => `retry-${filename}`)
      const fonts = await FontService.getFonts()
      expect(fonts.rijksoverheidsanstext.normal).toBe(
        'rijksoverheidsanstext-regular-webfont.ttf',
      )
    })
  })
})

import { getAsset } from './assetsRegistry'

/**
 * Interface for individual font variants in pdfMake format
 */
interface PdfFontVariants {
  normal?: string
  bold?: string
  italics?: string
  bolditalics?: string
}

/**
 * Interface for pdfMake font definitions
 */
interface PdfFonts {
  [fontFamily: string]: PdfFontVariants
}

/**
 * Interface for virtual file system (VFS) used by pdfMake
 */
interface VirtualFileSystem {
  [filename: string]: string
}

let initialized: boolean = false
let fonts: PdfFonts = {}
let vfs: VirtualFileSystem = {}
let isLoading: boolean = false
let loadPromise: Promise<void> | null = null

const fontAssetPaths = {
  rijksoverheidsanstext: {
    regular: 'rijksoverheidsanstext-regular-webfont.ttf',
    bold: 'rijksoverheidsanstext-bold-webfont.ttf',
    italic: 'rijksoverheidsanstext-italic-webfont.ttf'
  }
}

/**
 * Service to load fonts and VFS for pdfMake
 */
const FontService = {
  async getFonts(): Promise<PdfFonts> {
    if (!initialized) {
      await this._loadFonts()
    }
    return fonts
  },

  async getVFS(): Promise<VirtualFileSystem> {
    if (!initialized && !isLoading) {
      await this._loadFonts()
    }
    return vfs
  },

  async _loadFonts(): Promise<void> {
    if (isLoading && loadPromise) {
      return loadPromise
    }

    isLoading = true
    loadPromise = this._doLoadFonts()

    try {
      await loadPromise
      initialized = true
    } finally {
      isLoading = false
      loadPromise = null
    }
  },

  async _doLoadFonts(): Promise<void> {
    const fontDefinitions: PdfFonts = {}
    const vfsDefinitions: VirtualFileSystem = {}

    for (const [family, variants] of Object.entries(fontAssetPaths)) {
      fontDefinitions[family] = {}

      const variantToPdfKey: Record<string, keyof PdfFontVariants> = {
        regular: 'normal',
        bold: 'bold',
        italic: 'italics'
      }

      const variantEntries = Object.entries(variants)
      for (const [variantType, filename] of variantEntries) {
        const pdfKey = variantToPdfKey[variantType]
        if (pdfKey && filename) {
          fontDefinitions[family][pdfKey] = filename
          const asset = await getAsset(filename)
          if (asset) {
            vfsDefinitions[filename] = asset
          }
        }
      }
      fontDefinitions[family].bolditalics = variants.bold
    }

    fonts = fontDefinitions
    vfs = vfsDefinitions
  }
}

export default FontService

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resizeImageToDataUri, convertWebpToPng } from '../../src/utils/imageResize'

/**
 * jsdom does not implement canvas 2d context, toDataURL, real image decoding,
 * or FileReader.readAsDataURL output. We stub Image, FileReader and the canvas
 * element returned by document.createElement so we can drive every code path in
 * imageResize.ts deterministically.
 */

// ---- Image stub -------------------------------------------------------------

interface StubImageController {
  shouldError: boolean
  naturalWidth: number
  naturalHeight: number
}

let imageController: StubImageController
let lastImageSrc: string | undefined

class StubImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private _src = ''

  set src(value: string) {
    this._src = value
    lastImageSrc = value
    // Mimic the async load: fire onload/onerror on the next microtask.
    queueMicrotask(() => {
      if (imageController.shouldError) {
        this.onerror?.()
        return
      }
      this.naturalWidth = imageController.naturalWidth
      this.naturalHeight = imageController.naturalHeight
      this.onload?.()
    })
  }

  get src(): string {
    return this._src
  }
}

// ---- FileReader stub --------------------------------------------------------

interface StubReaderController {
  shouldError: boolean
  result: string
}

let readerController: StubReaderController

class StubFileReader {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  result: string | null = null

  readAsDataURL(_file: unknown): void {
    queueMicrotask(() => {
      if (readerController.shouldError) {
        this.onerror?.()
        return
      }
      this.result = readerController.result
      this.onload?.()
    })
  }
}

// ---- Canvas stub ------------------------------------------------------------

// Map of mimeType+quality -> returned data URI. Lets each test decide exactly
// what toDataURL produces so estimateBase64Bytes lands above/below the limit.
type ToDataUrlFn = (type?: string, quality?: number) => string

let canvasToDataUrl: ToDataUrlFn
let drawImageCalls: number
let getContextReturnsNull: boolean

interface StubCanvas {
  width: number
  height: number
  getContext(kind: string): { drawImage: (...args: unknown[]) => void } | null
  toDataURL: ToDataUrlFn
}

function makeStubCanvas(): StubCanvas {
  return {
    width: 0,
    height: 0,
    getContext(_kind: string) {
      if (getContextReturnsNull) return null
      return {
        drawImage: () => {
          drawImageCalls += 1
        },
      }
    },
    toDataURL(type?: string, quality?: number) {
      return canvasToDataUrl(type, quality)
    },
  }
}

const realCreateElement = document.createElement.bind(document)

// Build a data URI whose base64 part has the requested decoded byte size.
// estimateBase64Bytes = ceil((len - commaIndex - 1) * 0.75); to get `bytes`
// decoded we need ~ bytes / 0.75 chars after the comma.
function dataUriOfBytes(prefix: string, bytes: number): string {
  const chars = Math.ceil(bytes / 0.75)
  return `${prefix},${'A'.repeat(chars)}`
}

function makeFile(type: string): File {
  return { type } as unknown as File
}

beforeEach(() => {
  imageController = { shouldError: false, naturalWidth: 100, naturalHeight: 50 }
  readerController = { shouldError: false, result: 'data:image/png;base64,AAAA' }
  lastImageSrc = undefined
  drawImageCalls = 0
  getContextReturnsNull = false
  canvasToDataUrl = (type) => `${type ?? 'image/webp'};base64,AAAA`

  vi.stubGlobal('Image', StubImage)
  vi.stubGlobal('FileReader', StubFileReader)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') {
      return makeStubCanvas() as unknown as HTMLCanvasElement
    }
    return realCreateElement(tag)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('resizeImageToDataUri — input validation', () => {
  it('throws a Dutch error for an unsupported file type', async () => {
    await expect(resizeImageToDataUri(makeFile('application/pdf'))).rejects.toThrow(
      'Dit bestandstype (application/pdf) wordt niet ondersteund. ' +
        'Ondersteunde formaten: PNG, JPEG, WebP, GIF en SVG.',
    )
  })

  it('uses the "onbekend" fallback when the file type is empty', async () => {
    await expect(resizeImageToDataUri(makeFile(''))).rejects.toThrow(
      'Dit bestandstype (onbekend) wordt niet ondersteund.',
    )
  })
})

describe('resizeImageToDataUri — non-photo lossless path', () => {
  it('returns the lossless WebP when it fits within the size limit', async () => {
    // Lossless small enough to fit under the default 2 MB limit.
    canvasToDataUrl = (type, quality) => {
      if (type === 'image/webp' && quality === 1.0) {
        return dataUriOfBytes('data:image/webp;base64', 100)
      }
      throw new Error('lossy should not be reached')
    }
    const result = await resizeImageToDataUri(makeFile('image/png'))
    expect(result).toContain('data:image/webp;base64,')
    expect(drawImageCalls).toBe(1)
  })

  it('falls through to a lossy quality level when lossless is too large', async () => {
    // maxSizeBytes small; lossless over the limit, the first lossy quality fits.
    canvasToDataUrl = (type, quality) => {
      if (quality === 1.0) return dataUriOfBytes('data:image/webp;base64', 5000)
      if (quality === 0.85) return dataUriOfBytes('data:image/webp;base64', 100)
      throw new Error('should have returned at q=0.85')
    }
    const result = await resizeImageToDataUri(makeFile('image/webp'), {
      maxSizeBytes: 1000,
    })
    expect(result).toContain('data:image/webp;base64,')
  })
})

describe('resizeImageToDataUri — photo (jpeg) path', () => {
  it('skips lossless and uses a lossy quality level', async () => {
    const seenQualities: number[] = []
    canvasToDataUrl = (type, quality) => {
      seenQualities.push(quality as number)
      // Only the 0.65 level fits, forcing the loop to iterate.
      if (quality === 0.65) return dataUriOfBytes('data:image/webp;base64', 100)
      return dataUriOfBytes('data:image/webp;base64', 5000)
    }
    const result = await resizeImageToDataUri(makeFile('image/jpeg'), {
      maxSizeBytes: 1000,
    })
    expect(result).toContain('data:image/webp;base64,')
    // Lossless (quality 1.0) must never be attempted for a photo.
    expect(seenQualities).not.toContain(1.0)
    expect(seenQualities).toEqual([0.85, 0.75, 0.65])
  })

  it('throws the too-large error when every quality level exceeds the limit', async () => {
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 5000)
    await expect(
      resizeImageToDataUri(makeFile('image/jpeg'), { maxSizeBytes: 1 }),
    ).rejects.toThrow(
      'De afbeelding is te groot, ook na verkleinen. Gebruik een kleinere afbeelding.',
    )
  })
})

describe('resizeImageToDataUri — SVG rasterization', () => {
  it('doubles natural dimensions for an SVG with explicit size', async () => {
    imageController.naturalWidth = 300
    imageController.naturalHeight = 200
    let capturedW = 0
    let capturedH = 0
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 10)
    // Capture canvas dimensions via createElement spy.
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    await resizeImageToDataUri(makeFile('image/svg+xml'))
    // 300*2=600 within 1200 wide; 200*2=400 within 900 tall → unchanged.
    expect(capturedW).toBe(600)
    expect(capturedH).toBe(400)
  })

  it('uses 800x600 fallback when an SVG reports 0x0 natural size', async () => {
    imageController.naturalWidth = 0
    imageController.naturalHeight = 0
    let capturedW = 0
    let capturedH = 0
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 10)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    await resizeImageToDataUri(makeFile('image/svg+xml'))
    // (0||800)*2=1600 → exceeds 1200 wide; scaled down by fitDimensions.
    // (0||600)*2=1200 height. After width fit: 1200 -> 1200 cap width.
    expect(capturedW).toBe(1200)
    // height = round(1200 * (1200/1600)) = 900 then capped at 900.
    expect(capturedH).toBe(900)
  })
})

describe('resizeImageToDataUri — fitDimensions scaling', () => {
  it('scales down when width exceeds maxWidth', async () => {
    imageController.naturalWidth = 2400
    imageController.naturalHeight = 600
    let capturedW = 0
    let capturedH = 0
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 10)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    await resizeImageToDataUri(makeFile('image/png'))
    // width 2400 > 1200 → width=1200, height = round(600 * 1200/2400) = 300.
    // height 300 < 900, so the second branch is not taken.
    expect(capturedW).toBe(1200)
    expect(capturedH).toBe(300)
  })

  it('scales down when height exceeds maxHeight', async () => {
    imageController.naturalWidth = 600
    imageController.naturalHeight = 1800
    let capturedW = 0
    let capturedH = 0
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 10)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    await resizeImageToDataUri(makeFile('image/png'))
    // width 600 < 1200, first branch skipped.
    // height 1800 > 900 → height=900, width = round(600 * 900/1800) = 300.
    expect(capturedW).toBe(300)
    expect(capturedH).toBe(900)
  })

  it('leaves dimensions unchanged when within both maxima', async () => {
    imageController.naturalWidth = 100
    imageController.naturalHeight = 50
    let capturedW = -1
    let capturedH = -1
    canvasToDataUrl = () => dataUriOfBytes('data:image/webp;base64', 10)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    await resizeImageToDataUri(makeFile('image/png'), {
      maxWidth: 1200,
      maxHeight: 900,
    })
    expect(capturedW).toBe(100)
    expect(capturedH).toBe(50)
  })
})

describe('resizeImageToDataUri — underlying loader errors', () => {
  it('rejects when the file cannot be read', async () => {
    readerController.shouldError = true
    await expect(resizeImageToDataUri(makeFile('image/png'))).rejects.toThrow(
      'Kan het bestand niet lezen.',
    )
  })

  it('rejects when the image cannot be decoded', async () => {
    imageController.shouldError = true
    await expect(resizeImageToDataUri(makeFile('image/png'))).rejects.toThrow(
      'Kan de afbeelding niet laden.',
    )
  })
})

describe('estimateBase64Bytes — no comma in data URI', () => {
  it('uses the full string length when there is no comma', async () => {
    // A toDataURL output without a comma exercises the commaIndex === -1 branch.
    // Make the no-comma string short enough to fit so the function returns it.
    canvasToDataUrl = () => 'A'.repeat(50) // length 50, no comma
    const result = await resizeImageToDataUri(makeFile('image/png'), {
      maxSizeBytes: 100,
    })
    expect(result).toBe('A'.repeat(50))
  })
})

describe('convertWebpToPng', () => {
  it('returns the input unchanged when it is not a WebP data URI', async () => {
    const input = 'data:image/png;base64,AAAA'
    const result = await convertWebpToPng(input)
    expect(result).toBe(input)
  })

  it('redraws a WebP data URI through canvas and returns PNG', async () => {
    imageController.naturalWidth = 320
    imageController.naturalHeight = 240
    let capturedW = -1
    let capturedH = -1
    canvasToDataUrl = (type) => `${type ?? 'image/png'};base64,PNGDATA`
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const c = makeStubCanvas()
        const orig = c.toDataURL
        c.toDataURL = (t, q) => {
          capturedW = c.width
          capturedH = c.height
          return orig(t, q)
        }
        return c as unknown as HTMLCanvasElement
      }
      return realCreateElement(tag)
    })
    const result = await convertWebpToPng('data:image/webp;base64,WEBPDATA')
    expect(result).toContain('image/png;base64,PNGDATA')
    expect(capturedW).toBe(320)
    expect(capturedH).toBe(240)
    expect(lastImageSrc).toBe('data:image/webp;base64,WEBPDATA')
  })
})

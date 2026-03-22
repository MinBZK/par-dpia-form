export interface ImageResizeOptions {
  maxWidth?: number
  maxHeight?: number
  maxSizeBytes?: number
}

const DEFAULT_MAX_WIDTH = 1200
const DEFAULT_MAX_HEIGHT = 900
const DEFAULT_MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB base64

const JPEG_INITIAL_QUALITY = 0.85
const JPEG_MIN_QUALITY = 0.5
const JPEG_QUALITY_STEP = 0.1

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

/**
 * Resize and compress an image file to a base64 data URI.
 *
 * Strategy:
 * 1. SVG: rasterize to PNG at 2x resolution (eliminates XSS risk, compatible with pdfmake)
 * 2. If the image is already within dimension and size limits, return the original format
 * 3. Resize preserving format: PNG→PNG, JPEG→JPEG
 * 4. If PNG result is too large, fall back to JPEG
 * 5. If JPEG is still too large, progressively reduce quality
 */
export async function resizeImageToDataUri(
  file: File,
  options?: ImageResizeOptions,
): Promise<string> {
  if (!SUPPORTED_TYPES.includes(file.type)) {
    throw new Error(
      `Dit bestandstype (${file.type || 'onbekend'}) wordt niet ondersteund. ` +
      'Ondersteunde formaten: PNG, JPEG, WebP, GIF en SVG.',
    )
  }

  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX_HEIGHT
  const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES

  // SVG: rasterize to PNG at 2x for sharp rendering
  if (file.type === 'image/svg+xml') {
    return rasterizeSvg(file, maxWidth, maxHeight, maxSizeBytes)
  }

  const originalDataUri = await fileToDataUri(file)
  const img = await loadImage(originalDataUri)

  // Always draw through canvas to strip EXIF metadata (GPS, author, camera info)
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  // Try original format first (preserve PNG transparency, JPEG efficiency)
  const isJpeg = file.type === 'image/jpeg'

  if (isJpeg) {
    return exportJpegWithFallback(canvas, maxSizeBytes)
  }

  // PNG path: try PNG first, fall back to JPEG if too large
  const pngResult = canvas.toDataURL('image/png')
  if (estimateBase64Bytes(pngResult) <= maxSizeBytes) {
    return pngResult
  }

  // PNG too large after resize — fall back to JPEG
  return exportJpegWithFallback(canvas, maxSizeBytes)
}

/**
 * Rasterize SVG to PNG at 2x resolution for sharp text/lines.
 * The SVG is loaded into an <img> (sandboxed, scripts don't execute),
 * drawn onto a canvas, and exported as PNG data URI.
 */
async function rasterizeSvg(
  file: File,
  maxWidth: number,
  maxHeight: number,
  maxSizeBytes: number,
): Promise<string> {
  const svgDataUri = await fileToDataUri(file)
  const img = await loadImage(svgDataUri)

  // SVGs may report 0×0 if no explicit width/height — use defaults
  const svgWidth = img.naturalWidth || 800
  const svgHeight = img.naturalHeight || 600

  // Render at 2x for sharp text, then fit within max dimensions
  const renderScale = 2
  const scaledWidth = svgWidth * renderScale
  const scaledHeight = svgHeight * renderScale
  const { width, height } = fitDimensions(scaledWidth, scaledHeight, maxWidth, maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  const pngResult = canvas.toDataURL('image/png')
  if (estimateBase64Bytes(pngResult) <= maxSizeBytes) {
    return pngResult
  }

  return exportJpegWithFallback(canvas, maxSizeBytes)
}

function exportJpegWithFallback(canvas: HTMLCanvasElement, maxSizeBytes: number): string {
  let quality = JPEG_INITIAL_QUALITY

  while (quality >= JPEG_MIN_QUALITY) {
    const result = canvas.toDataURL('image/jpeg', quality)
    if (estimateBase64Bytes(result) <= maxSizeBytes) {
      return result
    }
    quality -= JPEG_QUALITY_STEP
  }

  // Last attempt at minimum quality
  const lastResult = canvas.toDataURL('image/jpeg', JPEG_MIN_QUALITY)
  if (estimateBase64Bytes(lastResult) <= maxSizeBytes) {
    return lastResult
  }

  throw new Error(
    'De afbeelding is te groot, ook na verkleinen. Gebruik een kleinere afbeelding.',
  )
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Kan het bestand niet lezen.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Kan de afbeelding niet laden.'))
    img.src = src
  })
}

function fitDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  let width = srcWidth
  let height = srcHeight

  if (width > maxWidth) {
    height = Math.round(height * (maxWidth / width))
    width = maxWidth
  }
  if (height > maxHeight) {
    width = Math.round(width * (maxHeight / height))
    height = maxHeight
  }

  return { width, height }
}

/** Estimate the byte size of a data URI (base64 overhead ~33%) */
function estimateBase64Bytes(dataUri: string): number {
  const commaIndex = dataUri.indexOf(',')
  if (commaIndex === -1) return dataUri.length
  const base64Part = dataUri.length - commaIndex - 1
  return Math.ceil(base64Part * 0.75)
}

export interface ImageResizeOptions {
  maxWidth?: number
  maxHeight?: number
  maxSizeBytes?: number
}

const DEFAULT_MAX_WIDTH = 1200
const DEFAULT_MAX_HEIGHT = 900
const DEFAULT_MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB base64

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

/**
 * Process an image file to a base64 data URI in WebP format.
 *
 * All images are drawn through canvas to strip EXIF metadata and converted
 * to WebP for optimal file size. Photos use lossy compression, other formats
 * use lossless first with lossy fallback. SVGs are rasterized at 2x resolution.
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

  const dataUri = await fileToDataUri(file)
  const img = await loadImage(dataUri)

  // SVGs may report 0×0 if no explicit width/height — render at 2x for sharp text
  const isSvg = file.type === 'image/svg+xml'
  const srcWidth = (isSvg ? (img.naturalWidth || 800) * 2 : img.naturalWidth)
  const srcHeight = (isSvg ? (img.naturalHeight || 600) * 2 : img.naturalHeight)

  const { width, height } = fitDimensions(srcWidth, srcHeight, maxWidth, maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

  const isPhoto = file.type === 'image/jpeg'

  // Non-photo sources: try lossless WebP first (sharp text/lines, no artifacts)
  if (!isPhoto) {
    const lossless = canvas.toDataURL('image/webp', 1.0)
    if (estimateBase64Bytes(lossless) <= maxSizeBytes) {
      return lossless
    }
  }

  // Lossy WebP at decreasing quality levels
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const result = canvas.toDataURL('image/webp', q)
    if (estimateBase64Bytes(result) <= maxSizeBytes) {
      return result
    }
  }

  throw new Error(
    'De afbeelding is te groot, ook na verkleinen. Gebruik een kleinere afbeelding.',
  )
}

/**
 * Convert a WebP data URI to PNG for use in contexts that don't support WebP (e.g. pdfmake).
 */
export async function convertWebpToPng(dataUri: string): Promise<string> {
  if (!dataUri.startsWith('data:image/webp')) return dataUri
  const img = await loadImage(dataUri)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
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

function estimateBase64Bytes(dataUri: string): number {
  const commaIndex = dataUri.indexOf(',')
  if (commaIndex === -1) return dataUri.length
  const base64Part = dataUri.length - commaIndex - 1
  return Math.ceil(base64Part * 0.75)
}

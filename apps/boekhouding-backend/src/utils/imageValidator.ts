// Browser-side image processing is untrusted, so re-validate the MIME here. The
// anchored allowlist passes only raster data: URIs, blocking data:image/svg+xml.
const ALLOWED_IMAGE_DATA = /^data:image\/(webp|png|jpe?g|gif);base64,[A-Za-z0-9+/]+={0,2}$/

// Bounds the recursive scan so a deeply nested payload can't overflow the stack.
const MAX_DEPTH = 100

export function isAllowedImageData(data: string): boolean {
  return ALLOWED_IMAGE_DATA.test(data)
}

/** False if any embedded image `data` URI fails the allowlist; deep nesting → false. */
export function hasOnlyAllowedImages(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false
  if (Array.isArray(value)) {
    return value.every((item) => hasOnlyAllowedImages(item, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    const data = (value as Record<string, unknown>).data
    // Case-insensitive prefix detection routes Data:/DATA: variants through the
    // strict (lowercase) allowlist instead of skipping them.
    if (typeof data === 'string' && /^data:/i.test(data) && !isAllowedImageData(data)) {
      return false
    }
    return Object.values(value as Record<string, unknown>).every((item) => hasOnlyAllowedImages(item, depth + 1))
  }
  return true
}

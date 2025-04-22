export function generateFilename(type: 'dpia' | 'prescan', extension: string): string {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-') // Replace colons with hyphens
    .replace(/\..+/, '') // Remove milliseconds
    .replace('T', '_') // Replace T with underscore

  return `${type}_${timestamp}.${extension}`
}

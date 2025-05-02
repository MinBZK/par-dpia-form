import { FormType } from '@/models/dpia.ts';

export function generateFilename(type: FormType, extension: string): string {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-') // Replace colons with hyphens
    .replace(/\..+/, '') // Remove milliseconds
    .replace('T', '_') // Replace T with underscore

  return `${type}_${timestamp}.${extension}`
}

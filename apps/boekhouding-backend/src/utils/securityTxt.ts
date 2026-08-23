import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { config } from '../config.js'

// Shared with the frontend image; resolved relative to this module (same
// 4-level ascent as validateState.ts's schema path) so dev, tests and the
// production build all agree on the path.
const moduleDir = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = resolve(moduleDir, '../../../../containers/security.txt.template')
const EXPIRES_PATH = resolve(moduleDir, '../../../../containers/security-txt-expires')

// Warns rather than silently falling back, in case a future Containerfile
// refactor drops the bake step. console.warn: this runs at module load,
// before an app (and its logger) exists.
export function resolveExpires(path: string): string {
  if (existsSync(path)) return readFileSync(path, 'utf-8').trim()
  console.warn(
    `security.txt: baked Expires file not found at ${path}; falling back to now + 1 year. ` +
      'This is expected in dev and tests, but must never happen in a deployed image ' +
      '(see containers/backend/Containerfile).',
  )
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString()
}

const template = readFileSync(TEMPLATE_PATH, 'utf-8')
const expires = resolveExpires(EXPIRES_PATH)

// Mirrors containers/frontend/entrypoint.sh: an empty publicUrl drops the
// Canonical line (optional per RFC 9116) instead of serving it broken.
export function buildSecurityTxt(template: string, expires: string, publicUrl: string): string {
  const canonicalHost = publicUrl.replace(/\/$/, '')
  const rendered = template
    .replace('${SECURITY_TXT_EXPIRES}', expires)
    .replace('${SECURITY_TXT_CANONICAL_HOST}', canonicalHost)

  if (canonicalHost) return rendered

  return rendered
    .split('\n')
    .filter(line => !line.startsWith('Canonical:'))
    .join('\n')
}

// config.publicUrl is already the first origin of a comma-separated
// PUBLIC_HOST (see parseCorsOrigin in config.ts); only the trailing slash is
// this module's concern.
export const securityTxt = buildSecurityTxt(template, expires, config.publicUrl)

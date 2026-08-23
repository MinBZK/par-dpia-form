import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSecurityTxt, resolveExpires, securityTxt } from '../../src/utils/securityTxt.js'
import { config } from '../../src/config.js'

const TEMPLATE =
  'Expires: ${SECURITY_TXT_EXPIRES}\n' +
  'Canonical: ${SECURITY_TXT_CANONICAL_HOST}/.well-known/security.txt\n' +
  '\n' +
  'Contact: mailto:security@ncsc.nl\n'

describe('buildSecurityTxt', () => {
  it('substitutes Expires and Canonical when a publicUrl is set', () => {
    const rendered = buildSecurityTxt(TEMPLATE, '2099-01-01T00:00:00Z', 'https://example.nl')
    expect(rendered).toBe(
      'Expires: 2099-01-01T00:00:00Z\n' +
        'Canonical: https://example.nl/.well-known/security.txt\n' +
        '\n' +
        'Contact: mailto:security@ncsc.nl\n',
    )
  })

  it('strips a trailing slash from publicUrl before building Canonical', () => {
    const rendered = buildSecurityTxt(TEMPLATE, '2099-01-01T00:00:00Z', 'https://example.nl/')
    expect(rendered).toContain('Canonical: https://example.nl/.well-known/security.txt')
  })

  // Mirrors containers/frontend/entrypoint.sh: no publicUrl means no Canonical
  // line at all, not an empty or half-finished one, so the file stays valid.
  it('drops the Canonical line entirely when publicUrl is empty', () => {
    const rendered = buildSecurityTxt(TEMPLATE, '2099-01-01T00:00:00Z', '')
    expect(rendered).not.toContain('Canonical')
    expect(rendered).not.toContain('${')
  })
})

describe('securityTxt', () => {
  it('is built from the real template and config.publicUrl', () => {
    expect(securityTxt).toContain('Contact: mailto:security@ncsc.nl')
    expect(securityTxt).toContain(`Canonical: ${config.publicUrl}/.well-known/security.txt`)
    expect(securityTxt).not.toContain('${')
  })
})

describe('resolveExpires', () => {
  it('reads and trims the build-baked file when it exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'security-txt-expires-'))
    const path = join(dir, 'security-txt-expires')
    writeFileSync(path, '2099-01-01T00:00:00Z\n')
    try {
      expect(resolveExpires(path)).toBe('2099-01-01T00:00:00Z')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Only reachable outside containers/backend/Containerfile's build (a local
  // dev run, or this test suite): the built image always ships the file. The
  // fallback deliberately warns (see the comment on resolveExpires); that
  // warning is expected here, so it is suppressed rather than left to clutter
  // this otherwise-green test run.
  it('falls back to about a year out when the file is missing, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const missingPath = join(tmpdir(), `security-txt-expires-missing-${Date.now()}`)
      const fallback = resolveExpires(missingPath)
      const parsed = new Date(fallback)
      const deltaDays = (parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      expect(deltaDays).toBeGreaterThan(360)
      expect(deltaDays).toBeLessThan(366)
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0][0]).toContain(missingPath)
    } finally {
      warn.mockRestore()
    }
  })
})

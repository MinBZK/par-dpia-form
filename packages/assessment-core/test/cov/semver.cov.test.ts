import { describe, it, expect } from 'vitest'
import { parseUrn, isPrerelease, coarseVersion, canonicalVersion, compareVersions } from '../../src/versioning/semver'

describe('parseUrn', () => {
  it('parses an official versioned urn into type/version/channel', () => {
    expect(parseUrn('urn:nl:dpia:3.0')).toEqual({ type: 'dpia', version: '3.0', channel: 'official' })
  })

  it('parses a concept (prerelease) urn as the concept channel', () => {
    expect(parseUrn('urn:nl:dpia:3.1.0-concept.2')).toEqual({
      type: 'dpia',
      version: '3.1.0-concept.2',
      channel: 'concept',
    })
  })

  it('parses prescan and iama types', () => {
    expect(parseUrn('urn:nl:prescan:2.0')?.type).toBe('prescan')
    expect(parseUrn('urn:nl:iama:2.0')?.type).toBe('iama')
  })

  it('returns null for a bare urn without a version segment', () => {
    expect(parseUrn('urn:nl:dpia')).toBeNull()
  })

  it('returns null for a wrong namespace prefix', () => {
    expect(parseUrn('urn:other:dpia:3.0')).toBeNull()
  })

  it('returns null for a malformed version', () => {
    expect(parseUrn('urn:nl:dpia:v3')).toBeNull()
  })

  it('returns null for undefined, null and empty input', () => {
    expect(parseUrn(undefined)).toBeNull()
    expect(parseUrn(null)).toBeNull()
    expect(parseUrn('')).toBeNull()
  })
})

describe('isPrerelease', () => {
  it('is true when a prerelease suffix is present', () => {
    expect(isPrerelease('3.1.0-concept.2')).toBe(true)
  })

  it('is false for two- and three-segment release versions', () => {
    expect(isPrerelease('3.0')).toBe(false)
    expect(isPrerelease('3.1.0')).toBe(false)
  })
})

describe('coarseVersion', () => {
  it('pads a single-segment version with minor 0', () => {
    expect(coarseVersion('3')).toBe('3.0')
  })

  it('keeps an explicit major.minor', () => {
    expect(coarseVersion('3.1')).toBe('3.1')
  })

  it('drops the patch segment', () => {
    expect(coarseVersion('2.4.7')).toBe('2.4')
  })

  it('drops a prerelease suffix and patch', () => {
    expect(coarseVersion('3.1.0-concept.2')).toBe('3.1')
  })
})

describe('canonicalVersion', () => {
  it('coarsens an official version to MAJOR.MINOR', () => {
    expect(canonicalVersion('3.0')).toBe('3.0')
    expect(canonicalVersion('3.1.0')).toBe('3.1')
  })

  it('keeps a concept version in full', () => {
    expect(canonicalVersion('3.1.0-concept.2')).toBe('3.1.0-concept.2')
  })
})

describe('compareVersions', () => {
  it('treats a missing patch as zero (3.0 equals 3.0.0)', () => {
    expect(compareVersions('3.0', '3.0.0')).toBe(0)
  })

  it('orders by minor', () => {
    expect(compareVersions('3.0', '3.1')).toBe(-1)
    expect(compareVersions('3.1', '3.0')).toBe(1)
  })

  it('orders minor numerically, not lexically (3.2 < 3.10)', () => {
    expect(compareVersions('3.2', '3.10')).toBe(-1)
  })

  it('orders by major', () => {
    expect(compareVersions('2.9', '3.0')).toBe(-1)
  })

  it('orders by patch', () => {
    expect(compareVersions('3.1.0', '3.1.1')).toBe(-1)
  })

  it('ranks a prerelease below its release (concept < final)', () => {
    expect(compareVersions('3.1.0-concept.2', '3.1.0')).toBe(-1)
    expect(compareVersions('3.1.0', '3.1.0-concept.2')).toBe(1)
  })

  it('orders numeric prerelease identifiers numerically (concept.2 < concept.10)', () => {
    expect(compareVersions('3.1.0-concept.2', '3.1.0-concept.10')).toBe(-1)
    expect(compareVersions('3.1.0-concept.10', '3.1.0-concept.2')).toBe(1)
  })

  it('ranks a numeric identifier below an alphanumeric one', () => {
    expect(compareVersions('3.1.0-1', '3.1.0-alpha')).toBe(-1)
    expect(compareVersions('3.1.0-alpha', '3.1.0-1')).toBe(1)
  })

  it('orders alphanumeric identifiers lexically', () => {
    expect(compareVersions('3.1.0-alpha', '3.1.0-beta')).toBe(-1)
    expect(compareVersions('3.1.0-beta', '3.1.0-alpha')).toBe(1)
  })

  it('ranks a smaller set of prerelease fields below a larger set', () => {
    expect(compareVersions('3.1.0-alpha', '3.1.0-alpha.1')).toBe(-1)
    expect(compareVersions('3.1.0-alpha.1', '3.1.0-alpha')).toBe(1)
  })

  it('returns 0 for identical versions including prerelease', () => {
    expect(compareVersions('3.1.0-concept.2', '3.1.0-concept.2')).toBe(0)
    expect(compareVersions('3.0', '3.0')).toBe(0)
  })
})

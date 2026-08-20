import { describe, it, expect } from 'vitest'
import {
  versionsForType,
  latestOfficialVersion,
  findNewerVersion,
  type SourceManifest,
} from '../../src/versioning/manifest'

const manifest: SourceManifest = {
  schemaVersion: 1,
  types: {
    dpia: {
      latestOfficial: '3.0',
      begrippenkader: 'begrippenkader_dpia.yaml',
      versions: [
        { version: '3.0', channel: 'official', file: 'dpia.yaml' },
        { version: '2.5', channel: 'official', file: 'dpia-2.5.yaml' },
        { version: '3.1.0-concept.2', channel: 'concept', file: 'dpia-3.1.yaml' },
      ],
    },
    iama: {
      latestOfficial: '2.0',
      begrippenkader: 'begrippenkader_iama.yaml',
      versions: [{ version: '2.0', channel: 'official', file: 'iama.yaml' }],
    },
  },
}

describe('versionsForType', () => {
  it('returns the versions sorted newest first', () => {
    expect(versionsForType(manifest, 'dpia').map((v) => v.version)).toEqual([
      '3.1.0-concept.2',
      '3.0',
      '2.5',
    ])
  })

  it('returns an empty list for an unknown type', () => {
    expect(versionsForType(manifest, 'onbekend')).toEqual([])
  })
})

describe('latestOfficialVersion', () => {
  it('returns the latest official version string', () => {
    expect(latestOfficialVersion(manifest, 'dpia')).toBe('3.0')
  })

  it('returns undefined for an unknown type', () => {
    expect(latestOfficialVersion(manifest, 'onbekend')).toBeUndefined()
  })
})

describe('findNewerVersion', () => {
  it('returns a newer official version', () => {
    expect(findNewerVersion(manifest, 'dpia', '2.5')?.version).toBe('3.0')
  })

  it('returns undefined when the pinned version is already the newest', () => {
    expect(findNewerVersion(manifest, 'dpia', '3.1.0-concept.2', true)).toBeUndefined()
  })

  it('ignores concept versions unless concepts are allowed', () => {
    expect(findNewerVersion(manifest, 'dpia', '3.0', false)).toBeUndefined()
  })

  it('returns a concept version when concepts are allowed', () => {
    expect(findNewerVersion(manifest, 'dpia', '3.0', true)?.version).toBe('3.1.0-concept.2')
  })

  it('picks the highest candidate among several', () => {
    expect(findNewerVersion(manifest, 'dpia', '2.5', true)?.version).toBe('3.1.0-concept.2')
  })

  it('returns undefined for an unknown type', () => {
    expect(findNewerVersion(manifest, 'onbekend', '1.0')).toBeUndefined()
  })
})

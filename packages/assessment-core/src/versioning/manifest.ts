// Runtime view of the source manifest (mirrors schemas/source-manifest.v1.schema.json)
// plus pure query helpers used by version-upgrade detection and the transparency page.

import { compareVersions, isPrerelease, type Channel } from './semver'

export interface ManifestVersion {
  version: string
  channel: Channel
  file: string
  releasedAt?: string
  changelog?: string[]
}

export interface ManifestType {
  latestOfficial: string
  begrippenkader: string
  enrichOncePerPage?: boolean
  versions: ManifestVersion[]
}

export interface SourceManifest {
  schemaVersion: number
  types: Record<string, ManifestType>
}

// Versions for a type, newest first. Empty for an unknown type.
export function versionsForType(manifest: SourceManifest, type: string): ManifestVersion[] {
  const def = manifest.types[type]
  if (!def) return []
  return [...def.versions].sort((a, b) => compareVersions(b.version, a.version))
}

// The version string unpinned consumers resolve to, or undefined for an unknown type.
export function latestOfficialVersion(manifest: SourceManifest, type: string): string | undefined {
  return manifest.types[type]?.latestOfficial
}

// The newest version strictly above `pinned`, considering concept versions only
// when `allowConcept` is set. Returns undefined when nothing newer is available.
export function findNewerVersion(
  manifest: SourceManifest,
  type: string,
  pinned: string,
  allowConcept = false,
): ManifestVersion | undefined {
  const candidates = versionsForType(manifest, type).filter(
    (v) => (allowConcept || !isPrerelease(v.version)) && compareVersions(v.version, pinned) > 0,
  )
  return candidates[0]
}

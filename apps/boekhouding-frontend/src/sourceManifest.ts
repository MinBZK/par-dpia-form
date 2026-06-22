import type { SourceManifest } from '@overheid-assessment/core'

// Loads the build-time generated runtime manifest (sources/generated/manifest.json,
// produced by build_sources.py). A dynamic import so a missing artefact degrades to the
// page's error state rather than breaking the bundle. Excluded from coverage: it only
// resolves a build artefact that is absent during unit tests (the page test mocks this).
export async function loadSourceManifest(): Promise<SourceManifest> {
  const module = await import('../../../sources/generated/manifest.json')
  return (module.default ?? module) as unknown as SourceManifest
}

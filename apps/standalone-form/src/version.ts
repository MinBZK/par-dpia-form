// Formats the display version from a build-time tag and commit, both defaulting
// to the sentinel 'dev' when not baked in. Called by vite.config.ts to inject
// the result as a <meta name="app-version"> tag (LandingView reads it). The
// channel is derived from those signals: a CalVer tag means a release, an
// untagged build with a real commit is a development build, and the bare local
// build has neither.
//
// The untagged form deliberately renders as "ontwikkel (commit <7-hex>)" so the
// production overlay (containers/frontend/overlay.Dockerfile) can sed-replace it
// with the CalVer tag, which is unknown when the acceptatie image is built. The
// version lives in the <meta> tag (not the CSP-hashed inline script), so the
// sed does not invalidate the standalone's script hash.
export function formatBuildVersion(tag: string, commit: string): string {
  if (tag !== 'dev') return tag
  if (commit !== 'dev') return `ontwikkel (commit ${commit})`
  return 'ontwikkel (lokaal)'
}

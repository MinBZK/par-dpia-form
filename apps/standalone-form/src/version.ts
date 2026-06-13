// Build-time version constants (__APP_TAG__/__APP_COMMIT__) are injected via
// Vite `define`; both default to the sentinel 'dev' when not baked in. The
// channel is derived from those signals: a CalVer tag means a release, an
// untagged build with a real commit is a development build, and the bare
// local build has neither.
export function formatBuildVersion(tag: string, commit: string): string {
  if (tag !== 'dev') return tag
  if (commit !== 'dev') return `ontwikkel (commit ${commit})`
  return 'ontwikkel (lokaal)'
}

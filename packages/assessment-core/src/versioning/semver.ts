// Semver-with-prerelease helpers for content-version identifiers.
// Versions look like '3.0', '3.1.0' or '3.1.0-concept.2'; the URN that carries
// them looks like 'urn:nl:dpia:3.1.0-concept.2'. The stored metadata.urn stays
// coarse (MAJOR.MINOR); the full version lives in the manifest and the pin.

export type Channel = 'official' | 'concept'

export interface ParsedUrn {
  type: string
  version: string
  channel: Channel
}

// Deliberately looser than the authoring gate: the JSON schemas (assessment-definition,
// source-manifest) only allow a `-concept[.N]` prerelease, but this parser/comparator
// accepts any semver prerelease so the comparator stays general. The schemas are the
// canonical authoring grammar; this is the permissive runtime view.
const VERSION = String.raw`\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?`
const URN_RE = new RegExp(`^urn:nl:([a-z]+):(${VERSION})$`)

// Parse a versioned URN into its type, full version and derived channel.
// Returns null when the input is empty or not a well-formed nl-gov assessment URN.
export function parseUrn(urn: string | null | undefined): ParsedUrn | null {
  if (!urn) return null
  const match = URN_RE.exec(urn)
  if (!match) return null
  const version = match[2]
  return { type: match[1], version, channel: isPrerelease(version) ? 'concept' : 'official' }
}

// Whether a version carries a prerelease (concept) suffix.
export function isPrerelease(version: string): boolean {
  return version.includes('-')
}

// Reduce a full version to the MAJOR.MINOR form stamped into metadata.urn.
export function coarseVersion(version: string): string {
  const parts = version.split('-')[0].split('.')
  return `${parts[0]}.${parts[1] ?? '0'}`
}

function splitVersion(version: string): { main: number[]; pre: string[] | null } {
  const dash = version.indexOf('-')
  const mainStr = dash === -1 ? version : version.slice(0, dash)
  const pre = dash === -1 ? null : version.slice(dash + 1).split('.')
  const main = mainStr.split('.').map(Number)
  while (main.length < 3) main.push(0)
  return { main, pre }
}

// Compare two prerelease identifiers per semver: numeric identifiers numerically,
// numeric below alphanumeric, otherwise ASCII order.
function compareIdentifiers(a: string, b: string): number {
  const aNum = /^\d+$/.test(a)
  const bNum = /^\d+$/.test(b)
  if (aNum && bNum) {
    const diff = Number(a) - Number(b)
    return diff === 0 ? 0 : diff < 0 ? -1 : 1
  }
  if (aNum) return -1
  if (bNum) return 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

function comparePre(a: string[], b: string[]): number {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const cmp = compareIdentifiers(a[i], b[i])
    if (cmp !== 0) return cmp
  }
  if (a.length === b.length) return 0
  return a.length < b.length ? -1 : 1
}

// Compare two version strings (-1 | 0 | 1). A missing patch is treated as 0 and a
// prerelease ranks below its corresponding release.
export function compareVersions(a: string, b: string): number {
  const va = splitVersion(a)
  const vb = splitVersion(b)
  for (let i = 0; i < 3; i++) {
    if (va.main[i] !== vb.main[i]) return va.main[i] < vb.main[i] ? -1 : 1
  }
  if (va.pre === null && vb.pre === null) return 0
  if (va.pre === null) return 1
  if (vb.pre === null) return -1
  return comparePre(va.pre, vb.pre)
}

import { OUTPUT_SCHEMA_URL } from './validateState.js'

// Canonical URN (including version) per assessment type, mirroring the urn + version
// fields in sources/<type>.yaml. Only used to normalise lean create payloads — the
// pre-scan-to-DPIA conversion and legacy imports omit metadata.urn — so they satisfy
// the output schema's required metadata.urn. The authoritative urn is re-emitted by
// the client on the first save; a version drift here is cosmetic, since the namespace
// is derived from the urn prefix and the value self-corrects on the next save.
export const ASSESSMENT_TYPE_URNS = {
  prescan: 'urn:nl:prescan:2.0',
  dpia: 'urn:nl:dpia:3.0',
  iama: 'urn:nl:iama:2.0',
} as const

export type AssessmentType = keyof typeof ASSESSMENT_TYPE_URNS

// Default pinned version per type (the version part of ASSESSMENT_TYPE_URNS), used when a
// create request omits one. These are the current latest-official versions.
export const DEFAULT_DEFINITION_VERSIONS: Record<AssessmentType, string> = {
  prescan: '2.0',
  dpia: '3.0',
  iama: '2.0',
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

// Fill in the schema-required metadata that lean create payloads omit, without
// overwriting anything the client did provide, then leave answer validation to
// validateState. Returns a new object; the input is not mutated.
export function normalizeCreateState(
  state: Record<string, unknown>,
  assessmentType: AssessmentType,
  definitionVersion?: string,
): Record<string, unknown> {
  const metadata = asObject(state.metadata)
  // Compose the fallback urn from the pinned version (official stays MAJOR.MINOR by
  // convention, concept keeps its full identifier — mirrors the client getUrn / D1);
  // fall back to the type default when no version is given.
  const fallbackUrn = definitionVersion
    ? `urn:nl:${assessmentType}:${definitionVersion}`
    : ASSESSMENT_TYPE_URNS[assessmentType]
  return {
    ...state,
    $schema: typeof state.$schema === 'string' ? state.$schema : OUTPUT_SCHEMA_URL,
    metadata: {
      ...metadata,
      urn: typeof metadata.urn === 'string' ? metadata.urn : fallbackUrn,
      createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date().toISOString(),
    },
    answers: typeof state.answers === 'object' && state.answers !== null ? state.answers : {},
  }
}

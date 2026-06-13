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

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

// Fill in the schema-required metadata that lean create payloads omit, without
// overwriting anything the client did provide, then leave answer validation to
// validateState. Returns a new object; the input is not mutated.
export function normalizeCreateState(
  state: Record<string, unknown>,
  assessmentType: AssessmentType,
): Record<string, unknown> {
  const metadata = asObject(state.metadata)
  return {
    ...state,
    $schema: typeof state.$schema === 'string' ? state.$schema : OUTPUT_SCHEMA_URL,
    metadata: {
      ...metadata,
      urn: typeof metadata.urn === 'string' ? metadata.urn : ASSESSMENT_TYPE_URNS[assessmentType],
      createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date().toISOString(),
    },
    answers: typeof state.answers === 'object' && state.answers !== null ? state.answers : {},
  }
}

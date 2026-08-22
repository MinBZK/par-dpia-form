const STATE_KEYS = ['$schema', 'metadata', 'answers', '_prescanAnswers'] as const
const METADATA_KEYS = ['urn', 'createdAt', 'createdBy', 'completedTasks'] as const

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source) result[key] = source[key]
  }
  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Drop the keys the output schema does not define, before validateState runs.
 *
 * Rows written before the v2 migration carry a top-level `taskState` and a
 * `metadata.activeNamespace` (rebuildState still strips those when replaying old
 * edits). Rejecting them instead of dropping them would lock the owner out of an
 * assessment that has not been re-saved since that migration, so unknown keys are
 * stripped and the strict schema then only sees what it defines.
 *
 * Deliberately an explicit allowlist rather than ajv's removeAdditional: `answers`
 * is an open map (propertyNames + additionalProperties), so removeAdditional would
 * silently delete answers that fail their subschema.
 */
export function stripUnknownStateKeys(state: unknown): unknown {
  if (!isPlainObject(state)) return state

  const result = pick(state, STATE_KEYS)
  if (isPlainObject(result.metadata)) {
    result.metadata = pick(result.metadata, METADATA_KEYS)
  }
  return result
}

const STATE_KEYS = ['$schema', 'metadata', 'answers', '_prescanAnswers'] as const
const METADATA_KEYS = ['urn', 'createdAt', 'createdBy', 'completedTasks'] as const

function pick(
  source: Record<string, unknown>,
  keys: readonly string[],
  dropped: string[],
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if (keys.includes(key)) {
      result[key] = source[key]
    } else {
      dropped.push(`${prefix}${key}`)
    }
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
 *
 * Returns what it dropped so the caller can log it. Silent to the client is right
 * here, silent to us is not: a field added to the client state but not to
 * STATE_KEYS would otherwise vanish on every save with nothing to search for.
 */
export function stripUnknownStateKeys(state: unknown): { state: unknown; dropped: string[] } {
  if (!isPlainObject(state)) return { state, dropped: [] }

  const dropped: string[] = []
  const result = pick(state, STATE_KEYS, dropped)
  if (isPlainObject(result.metadata)) {
    result.metadata = pick(result.metadata, METADATA_KEYS, dropped, 'metadata.')
  }
  return { state: result, dropped }
}

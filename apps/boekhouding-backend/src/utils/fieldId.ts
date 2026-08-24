/**
 * Field identifier format for the assessment_edits table.
 *
 * This mirrors packages/assessment-core/src/utils/instanceId.ts and
 * .../utils/fieldUrn.ts line for line. The backend cannot import them: the core
 * package ships Vue and pinia and its TypeScript sources unbuilt, while this app
 * compiles with plain `tsc` and its container copies only apps/boekhouding-backend.
 * test/fieldIdConformance.test.ts asserts both copies stay behaviourally identical.
 */

// r-component (RFC 8141) carrying the task coordinates, e.g.
// "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0". The "?=" is the resolution
// component, not a typo for "?".
const FIELD_URN = /^urn:nl:(\w+):[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/

// Namespace prefixes of the dot format: legacy edit rows written before the URNs,
// and the ids the version history builds to look labels up by. A new assessment
// has to be added here, or its dot ids parse as a plain key without a namespace.
const DOT_NAMESPACES = ['dpia', 'prescan', 'iama']

/**
 * Build an instance ID from a task ID and optional index.
 * "2.1.3" + 0 → "2.1.3[0]"
 */
export function buildInstanceId(taskId: string, index?: number): string {
  return index !== undefined ? `${taskId}[${index}]` : taskId
}

/**
 * Parse an instance ID into taskId and optional index.
 * "2.1.3[0]" → { taskId: "2.1.3", index: 0 }
 */
export function parseInstanceId(instanceId: string): { taskId: string; index?: number } {
  const match = instanceId.match(/^(.+)\[(\d+)\]$/)
  if (match) return { taskId: match[1], index: parseInt(match[2]) }
  return { taskId: instanceId }
}

/**
 * Build a URN-based field identifier for the assessment_edits table.
 * ("urn:nl:dpia:3.0", "2.1.3[0]") → "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0"
 */
export function buildFieldUrn(urn: string, instanceId: string): string {
  const { taskId, index } = parseInstanceId(instanceId)
  const fieldUrn = `${urn}?=task_id=${taskId}`
  return index !== undefined ? `${fieldUrn}&task_index=${index}` : fieldUrn
}

/**
 * Parse a field identifier back into its namespace and answer key.
 * "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0" → { namespace: "dpia", key: "2.1.3[0]" }
 * "dpia.2.1.3" → { namespace: "dpia", key: "2.1.3" }
 * "2.1.3" → { key: "2.1.3" }
 *
 * Returns null for a malformed URN; anything else falls through as a plain key.
 */
export function parseFieldUrn(fieldId: string): { namespace?: string; key: string } | null {
  if (fieldId.startsWith('urn:')) {
    const match = fieldId.match(FIELD_URN)
    if (!match) return null
    const [, rawNamespace, taskId, index] = match
    // The pre-scan carried "prescan_dpia" before the assessments were split.
    const namespace = rawNamespace === 'prescan_dpia' ? 'prescan' : rawNamespace
    return {
      namespace,
      key: buildInstanceId(taskId, index !== undefined ? parseInt(index) : undefined),
    }
  }

  const namespace = DOT_NAMESPACES.find((ns) => fieldId.startsWith(`${ns}.`))
  if (namespace) return { namespace, key: fieldId.substring(namespace.length + 1) }

  return { key: fieldId }
}

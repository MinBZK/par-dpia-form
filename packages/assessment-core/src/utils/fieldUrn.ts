import { FormType } from '../models/dpia'
import { buildInstanceId, parseInstanceId } from './instanceId'

// r-component (RFC 8141) carrying the task coordinates, e.g.
// "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0". The "?=" is the resolution
// component, not a typo for "?".
const FIELD_URN = /^urn:nl:(\w+):[^?]+\?=task_id=([^&]+)(?:&task_index=(\d+))?$/

// Namespace prefixes of the dot format: legacy edit rows written before the URNs,
// and the ids the version history builds to look labels up by. Derived from
// FormType, so a new assessment is covered the moment it exists.
const DOT_NAMESPACES: string[] = Object.values(FormType)

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

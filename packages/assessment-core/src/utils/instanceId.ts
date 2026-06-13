/**
 * Build an instance ID from a task ID and optional index.
 * "2.1.3" + 0 → "2.1.3[0]"
 * "2.1.3" + undefined → "2.1.3"
 */
export function buildInstanceId(taskId: string, index?: number): string {
  return index !== undefined ? `${taskId}[${index}]` : taskId
}

/**
 * Parse an instance ID into taskId and optional index.
 * "2.1.3" → { taskId: "2.1.3" }
 * "2.1.3[0]" → { taskId: "2.1.3", index: 0 }
 */
export function parseInstanceId(instanceId: string): { taskId: string; index?: number } {
  const match = instanceId.match(/^(.+)\[(\d+)\]$/)
  if (match) return { taskId: match[1], index: parseInt(match[2]) }
  return { taskId: instanceId }
}

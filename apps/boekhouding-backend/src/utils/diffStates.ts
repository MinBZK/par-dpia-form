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

/**
 * Build a URN-based field identifier for the assessment_edits table.
 * Example: "urn:nl:dpia:3.0?=task_id=2.1.3&task_index=0"
 */
export function buildFieldUrn(urn: string, instanceId: string): string {
  const { taskId, index } = parseInstanceId(instanceId)
  let fieldUrn = `${urn}?=task_id=${taskId}`
  if (index !== undefined) fieldUrn += `&task_index=${index}`
  return fieldUrn
}

export type EditRecord = {
  fieldId: string
  editType: string
  editedBy: string
  oldValue: unknown
  newValue: unknown
}

/**
 * Compares two states and produces field-level edit records.
 * Tracks answer changes, completed section changes, and task instance add/remove.
 * Uses URN-based field identifiers when available.
 */
export function diffStates(
  oldState: unknown,
  newState: unknown,
  editedBy: string,
): EditRecord[] {
  const edits: EditRecord[] = []

  const newMeta = (newState as any)?.metadata || {}
  const urn: string | undefined = newMeta.urn

  const oldAnswers = (oldState as any)?.answers || {}
  const newAnswers = (newState as any)?.answers || {}

  // Compare answers across namespaces
  const allNamespaces = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const ns of allNamespaces) {
    const oldNs = oldAnswers[ns] || {}
    const newNs = newAnswers[ns] || {}
    const allKeys = new Set([...Object.keys(oldNs), ...Object.keys(newNs)])

    for (const key of allKeys) {
      const oldVal = oldNs[key]
      const newVal = newNs[key]

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const fieldId = urn ? buildFieldUrn(urn, key) : `${ns}.${key}`
        edits.push({

          fieldId,
          editType: 'answer_change',
          editedBy,
          oldValue: oldVal ?? null,
          newValue: newVal ?? null,
        })
      }
    }
  }

  // Compare task state across namespaces
  const oldTaskState = (oldState as any)?.taskState || {}
  const newTaskState = (newState as any)?.taskState || {}
  const taskNamespaces = new Set([...Object.keys(oldTaskState), ...Object.keys(newTaskState)])

  for (const ns of taskNamespaces) {
    // Compare completed sections
    const oldCompleted = new Set<string>(oldTaskState[ns]?.completedRootTaskIds || [])
    const newCompleted = new Set<string>(newTaskState[ns]?.completedRootTaskIds || [])

    for (const id of newCompleted) {
      if (!oldCompleted.has(id)) {
        const fieldId = urn ? buildFieldUrn(urn, `completed.${id}`) : `${ns}.completed.${id}`
        edits.push({

          fieldId,
          editType: 'section_complete',
          editedBy,
          oldValue: false,
          newValue: true,
        })
      }
    }
    for (const id of oldCompleted) {
      if (!newCompleted.has(id)) {
        const fieldId = urn ? buildFieldUrn(urn, `completed.${id}`) : `${ns}.completed.${id}`
        edits.push({

          fieldId,
          editType: 'section_complete',
          editedBy,
          oldValue: true,
          newValue: false,
        })
      }
    }

    // Compare task instances (add/remove)
    const oldInstances = Object.keys(oldTaskState[ns]?.taskInstances || {})
    const newInstances = Object.keys(newTaskState[ns]?.taskInstances || {})
    const oldInstanceSet = new Set(oldInstances)
    const newInstanceSet = new Set(newInstances)

    for (const id of newInstances) {
      if (!oldInstanceSet.has(id)) {
        const fieldId = urn ? buildFieldUrn(urn, id) : `${ns}.${id}`
        edits.push({

          fieldId,
          editType: 'task_instance_add',
          editedBy,
          oldValue: null,
          newValue: newTaskState[ns].taskInstances[id],
        })
      }
    }
    for (const id of oldInstances) {
      if (!newInstanceSet.has(id)) {
        const fieldId = urn ? buildFieldUrn(urn, id) : `${ns}.${id}`
        edits.push({

          fieldId,
          editType: 'task_instance_remove',
          editedBy,
          oldValue: oldTaskState[ns].taskInstances[id],
          newValue: null,
        })
      }
    }
  }

  return edits
}

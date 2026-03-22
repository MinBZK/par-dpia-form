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

function isGroupedArray(value: unknown): value is Array<{ _index: number; [key: string]: unknown }> {
  return Array.isArray(value) && value.length > 0 && typeof value[0]?._index === 'number'
}

/**
 * Compare two grouped arrays element by element, matching on _index.
 */
function diffGroupedArrays(
  oldArr: Array<{ _index: number; [key: string]: unknown }> | undefined,
  newArr: Array<{ _index: number; [key: string]: unknown }> | undefined,
  parentKey: string,
  urn: string | undefined,
  editedBy: string,
): EditRecord[] {
  const edits: EditRecord[] = []
  const oldByIndex = new Map<number, Record<string, unknown>>()
  const newByIndex = new Map<number, Record<string, unknown>>()

  for (const el of oldArr ?? []) oldByIndex.set(el._index, el)
  for (const el of newArr ?? []) newByIndex.set(el._index, el)

  const allIndices = new Set([...oldByIndex.keys(), ...newByIndex.keys()])

  for (const idx of allIndices) {
    const oldEl = oldByIndex.get(idx)
    const newEl = newByIndex.get(idx)

    const childKeys = new Set<string>()
    if (oldEl) for (const k of Object.keys(oldEl)) { if (k !== '_index') childKeys.add(k) }
    if (newEl) for (const k of Object.keys(newEl)) { if (k !== '_index') childKeys.add(k) }

    // Entire instance added or removed — bundle child values into one edit
    if ((!oldEl && newEl) || (oldEl && !newEl)) {
      // Skip default index 0 when the parent key was newly saved —
      // index 0 always exists implicitly via init() and is not a user action.
      const skipDefault = idx === 0 && !oldEl && (!oldArr || oldArr.length === 0)
      if (!skipDefault) {
        // Collect child field values from the instance that existed
        const source = (oldEl ?? newEl)!
        const fields: Record<string, unknown> = {}
        for (const k of Object.keys(source)) {
          if (k !== '_index') fields[k] = source[k]
        }

        const instanceId = `${parentKey}[${idx}]`
        const fieldId = urn ? buildFieldUrn(urn, instanceId) : instanceId
        edits.push({
          fieldId,
          editType: !oldEl ? 'instance_added' : 'instance_removed',
          editedBy,
          oldValue: (!oldEl ? null : (Object.keys(fields).length > 0 ? fields : null)),
          newValue: (!newEl ? null : (Object.keys(fields).length > 0 ? fields : null)),
        })
      }
      continue
    }

    for (const childKey of childKeys) {
      const oldVal = oldEl?.[childKey]
      const newVal = newEl?.[childKey]

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const instanceId = `${childKey}[${idx}]`
        const fieldId = urn ? buildFieldUrn(urn, instanceId) : instanceId
        edits.push({
          fieldId,
          editType: 'answer_change',
          editedBy,
          oldValue: (oldVal ?? null),
          newValue: (newVal ?? null),
        })
      }
    }
  }

  return edits
}

/**
 * Compares two states and produces field-level edit records.
 * States use the unwrapped format: answers at top level, completedTasks in metadata.
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
  const allKeys = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])

  for (const key of allKeys) {
    const oldVal = oldAnswers[key]
    const newVal = newAnswers[key]

    // Handle grouped arrays: compare child-by-child
    if (isGroupedArray(oldVal) || isGroupedArray(newVal)) {
      edits.push(...diffGroupedArrays(
        isGroupedArray(oldVal) ? oldVal : undefined,
        isGroupedArray(newVal) ? newVal : undefined,
        key, urn, editedBy,
      ))
      continue
    }

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      const fieldId = urn ? buildFieldUrn(urn, key) : key
      edits.push({
        fieldId,
        editType: 'answer_change',
        editedBy,
        oldValue: (oldVal ?? null),
        newValue: (newVal ?? null),
      })
    }
  }

  // Compare completedTasks in metadata
  const oldCompleted = new Set<string>((oldState as any)?.metadata?.completedTasks || [])
  const newCompleted = new Set<string>(newMeta.completedTasks || [])

  for (const id of newCompleted) {
    if (!oldCompleted.has(id)) {
      const fieldId = urn ? buildFieldUrn(urn, `completed.${id}`) : `completed.${id}`
      edits.push({ fieldId, editType: 'section_complete', editedBy, oldValue: false, newValue: true })
    }
  }
  for (const id of oldCompleted) {
    if (!newCompleted.has(id)) {
      const fieldId = urn ? buildFieldUrn(urn, `completed.${id}`) : `completed.${id}`
      edits.push({ fieldId, editType: 'section_complete', editedBy, oldValue: true, newValue: false })
    }
  }

  return edits
}

import { FormType } from '../models/dpia'
import type { AssessmentState } from '../models/assessmentState'
import { migrateStateV1toV2 } from './stateMigration'

// Validate and parse a raw string as an importable assessment.
// Returns the normalized AssessmentState or throws a descriptive error.
// Migrates v1 nanoid-keyed states to v2 format so they are never stored
// with legacy keys on the server.
export function parseAndValidateImport(rawText: string): AssessmentState {
  let json: Record<string, unknown>
  try {
    json = JSON.parse(rawText)
  } catch {
    throw new Error('Ongeldig JSON-bestand')
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Bestand bevat geen geldig JSON-object')
  }

  if (!json.metadata || !json.answers) {
    throw new Error('Bestand mist metadata of answers — geen geldig assessment-bestand')
  }

  const detectedType = detectImportType(json)
  if (!detectedType) {
    throw new Error('Bestand bevat geen DPIA- of pre-scan antwoorden')
  }

  const state = normalizeToState(json, detectedType)
  return migrateStateV1toV2(state, {})
}

// Detect whether an uploaded JSON is a DPIA or pre-scan, supporting both
// AssessmentState (namespaced answers) and AssessmentOutput (flat answers + URN) formats.
export type ImportType = 'dpia' | 'prescan' | null

export const detectImportType = (json: Record<string, unknown>): ImportType => {
  // 1. Check URN in metadata (most reliable — present in AssessmentOutput exports)
  const urn = (json.metadata as Record<string, unknown>)?.urn as string | undefined
  if (urn) {
    if (urn.startsWith('urn:nl:dpia')) return 'dpia'
    if (urn.startsWith('urn:nl:prescan')) return 'prescan'
  }

  // 2. Check activeNamespace in metadata (present in AssessmentState from API)
  const ns = (json.metadata as Record<string, unknown>)?.activeNamespace as string | undefined
  if (ns === FormType.DPIA || ns === FormType.PRE_SCAN) {
    return ns === FormType.DPIA ? 'dpia' : 'prescan'
  }

  // 3. Check namespaced answer keys (AssessmentState format)
  const answers = json.answers as Record<string, unknown> | undefined
  if (answers?.[FormType.DPIA] && Object.keys(answers[FormType.DPIA] as object).length > 0) return 'dpia'
  if (answers?.[FormType.PRE_SCAN] && Object.keys(answers[FormType.PRE_SCAN] as object).length > 0) return 'prescan'

  // 4. If there are flat answers (no namespace keys) but no URN, we can't reliably detect
  if (answers && Object.keys(answers).length > 0) {
    // Flat answers without URN — assume DPIA as the more common case
    return 'dpia'
  }

  return null
}

// Derive completedRootTaskIds from answer keys.
// Answer keys like "1.2.1" belong to root task "1". If any answers exist under a
// root task, that section is considered completed.
export const deriveCompletedRootTaskIds = (answerKeys: string[]): string[] => {
  const rootIds = new Set<string>()
  for (const key of answerKeys) {
    const dotIndex = key.indexOf('.')
    rootIds.add(dotIndex === -1 ? key : key.substring(0, dotIndex))
  }
  return Array.from(rootIds).sort((a, b) => parseInt(a) - parseInt(b))
}

// Normalize an uploaded JSON to AssessmentState format.
// AssessmentOutput has flat answers; AssessmentState has namespaced answers.
// For flat answers (AssessmentOutput), also reconstructs completedRootTaskIds
// from the answer keys so sections show as completed after import.
export const normalizeToState = (json: Record<string, unknown>, detectedType: 'dpia' | 'prescan'): AssessmentState => {
  const answers = json.answers as Record<string, unknown> | undefined
  const namespace = detectedType === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN

  // Already namespaced (AssessmentState format)?
  if (answers?.[FormType.DPIA] || answers?.[FormType.PRE_SCAN]) {
    return json as unknown as AssessmentState
  }

  // Flat answers (AssessmentOutput format) — wrap in namespace and reconstruct taskState
  // Use explicit completedTasks if present; otherwise derive from answer keys
  const metadata = json.metadata as Record<string, unknown> | undefined
  const completedTasks = metadata?.completedTasks as string[] | undefined
  const completedRootTaskIds = completedTasks?.length
    ? completedTasks
    : deriveCompletedRootTaskIds(Object.keys(answers || {}))

  return {
    metadata: { createdAt: new Date().toISOString(), activeNamespace: namespace },
    taskState: {
      [namespace]: {
        currentRootTaskId: completedRootTaskIds[0] || '0',
        completedRootTaskIds,
        taskInstances: {},
      },
    } as AssessmentState['taskState'],
    answers: { [namespace]: answers } as AssessmentState['answers'],
  }
}

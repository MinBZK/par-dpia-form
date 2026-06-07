import { FormType } from '../models/dpia'
import type { AssessmentState, GroupedAnswerValue } from '../models/assessmentState'
import { migrateStateV1toV2 } from './stateMigration'
import { flattenGroupedAnswers } from './groupedAnswers'

// Validate and parse a raw string as an importable assessment.
// Returns the normalized AssessmentState (unified format) or throws a descriptive error.
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
    throw new Error('Bestand bevat geen DPIA-, pre-scan- of IAMA-antwoorden')
  }

  // Migrate v1 nanoid keys if needed (uses old taskInstances for ID mapping)
  const migrated = migrateStateV1toV2(json as any, {})

  // Normalize to unified format
  return normalizeToState(migrated as any, detectedType)
}

export type ImportType = 'dpia' | 'prescan' | 'iama' | null

export const detectImportType = (json: Record<string, unknown>): ImportType => {
  const urn = (json.metadata as Record<string, unknown>)?.urn as string | undefined
  if (urn) {
    if (urn.startsWith('urn:nl:dpia')) return 'dpia'
    if (urn.startsWith('urn:nl:prescan')) return 'prescan'
    if (urn.startsWith('urn:nl:iama')) return 'iama'
  }

  const answers = json.answers as Record<string, unknown> | undefined
  if (answers?.[FormType.DPIA] && Object.keys(answers[FormType.DPIA] as object).length > 0) return 'dpia'
  if (answers?.[FormType.PRE_SCAN] && Object.keys(answers[FormType.PRE_SCAN] as object).length > 0) return 'prescan'
  if (answers?.[FormType.IAMA] && Object.keys(answers[FormType.IAMA] as object).length > 0) return 'iama'

  if (answers && Object.keys(answers).length > 0) {
    return 'dpia'
  }

  return null
}

export const deriveCompletedRootTaskIds = (answerKeys: string[]): string[] => {
  const rootIds = new Set<string>()
  for (const key of answerKeys) {
    const dotIndex = key.indexOf('.')
    rootIds.add(dotIndex === -1 ? key : key.substring(0, dotIndex))
  }
  return Array.from(rootIds).sort((a, b) => parseInt(a) - parseInt(b))
}

/**
 * Normalize imported JSON to the unified AssessmentState format.
 * Handles old namespace-wrapped and new flat formats.
 * Flattens grouped arrays; puts completedTasks in metadata.
 */
export const normalizeToState = (json: Record<string, unknown>, detectedType: 'dpia' | 'prescan' | 'iama'): AssessmentState => {
  const answers = json.answers as Record<string, unknown> | undefined
  const metadata = json.metadata as Record<string, unknown> | undefined
  const namespace = detectedType === 'dpia'
    ? FormType.DPIA
    : detectedType === 'iama'
      ? FormType.IAMA
      : FormType.PRE_SCAN

  // Detect old namespace-wrapped format and unwrap.
  const isNamespaced = answers?.[FormType.PRE_SCAN] || answers?.[FormType.DPIA] || answers?.[FormType.IAMA]
  const unwrapped = (isNamespaced
    ? ((answers?.[namespace] || {}) as Record<string, unknown>)
    : (answers || {})) as Record<string, unknown>

  // Keep the grouped shape when present. applyStateToStores flattens on
  // load; saving later regroups via groupAnswers. Flattening here would
  // permanently replace the round-tripping format with a flat snapshot
  // that later grouped saves diff against as a wholesale restructure.
  const keepGrouped = Object.values(unwrapped).some((v) => Array.isArray(v))
  const outAnswers = keepGrouped
    ? unwrapped
    : unwrapped

  // Legacy v1 exports (no $schema, no urn) still need a flat view to
  // derive completedTasks from their answer keys.
  const isModernFormat = !!(json.$schema || (metadata?.urn as string))
  const flatForLegacy = !isModernFormat && keepGrouped
    ? flattenGroupedAnswers(unwrapped as Record<string, GroupedAnswerValue>)
    : (unwrapped as Record<string, unknown>)

  const explicitCompleted = metadata?.completedTasks as string[] | undefined
  const legacyCompleted = (json as any).taskState?.[namespace]?.completedRootTaskIds as string[] | undefined
  const completedTasks = explicitCompleted?.length
    ? explicitCompleted
    : legacyCompleted?.length
      ? legacyCompleted
      : isModernFormat
        ? []
        : deriveCompletedRootTaskIds(Object.keys(flatForLegacy))

  return {
    metadata: {
      urn: metadata?.urn as string | undefined,
      createdAt: (metadata?.createdAt as string) || new Date().toISOString(),
      ...(completedTasks.length > 0 && { completedTasks }),
    },
    answers: outAnswers as any,
  }
}

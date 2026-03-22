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
    throw new Error('Bestand bevat geen DPIA- of pre-scan antwoorden')
  }

  // Migrate v1 nanoid keys if needed (uses old taskInstances for ID mapping)
  const migrated = migrateStateV1toV2(json as any, {})

  // Normalize to unified format
  return normalizeToState(migrated as any, detectedType)
}

export type ImportType = 'dpia' | 'prescan' | null

export const detectImportType = (json: Record<string, unknown>): ImportType => {
  const urn = (json.metadata as Record<string, unknown>)?.urn as string | undefined
  if (urn) {
    if (urn.startsWith('urn:nl:dpia')) return 'dpia'
    if (urn.startsWith('urn:nl:prescan')) return 'prescan'
  }

  const answers = json.answers as Record<string, unknown> | undefined
  if (answers?.[FormType.DPIA] && Object.keys(answers[FormType.DPIA] as object).length > 0) return 'dpia'
  if (answers?.[FormType.PRE_SCAN] && Object.keys(answers[FormType.PRE_SCAN] as object).length > 0) return 'prescan'

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
export const normalizeToState = (json: Record<string, unknown>, detectedType: 'dpia' | 'prescan'): AssessmentState => {
  const answers = json.answers as Record<string, unknown> | undefined
  const metadata = json.metadata as Record<string, unknown> | undefined
  const namespace = detectedType === 'dpia' ? FormType.DPIA : FormType.PRE_SCAN

  // Detect old namespace-wrapped format
  const isNamespaced = answers?.[FormType.DPIA] || answers?.[FormType.PRE_SCAN]

  let flatAnswers: Record<string, unknown>
  if (isNamespaced) {
    const nsAnswers = (answers?.[namespace] || {}) as Record<string, unknown>
    flatAnswers = Object.values(nsAnswers).some(v => Array.isArray(v))
      ? flattenGroupedAnswers(nsAnswers as Record<string, GroupedAnswerValue>)
      : nsAnswers
  } else {
    flatAnswers = answers && Object.values(answers).some(v => Array.isArray(v))
      ? flattenGroupedAnswers(answers as Record<string, GroupedAnswerValue>)
      : (answers || {})
  }

  // Resolve completedTasks: explicit metadata > old taskState > derive for legacy only
  const explicitCompleted = metadata?.completedTasks as string[] | undefined
  const legacyCompleted = (json as any).taskState?.[namespace]?.completedRootTaskIds as string[] | undefined
  // Modern exports (with $schema or urn) omit completedTasks when nothing is completed.
  // Only derive from answer keys for old v1 exports that lack both indicators.
  const isModernFormat = !!(json.$schema || (metadata?.urn as string))
  const completedTasks = explicitCompleted?.length
    ? explicitCompleted
    : legacyCompleted?.length
      ? legacyCompleted
      : isModernFormat
        ? []
        : deriveCompletedRootTaskIds(Object.keys(flatAnswers))

  return {
    metadata: {
      urn: metadata?.urn as string | undefined,
      createdAt: (metadata?.createdAt as string) || new Date().toISOString(),
      ...(completedTasks.length > 0 && { completedTasks }),
    },
    answers: flatAnswers as any,
  }
}

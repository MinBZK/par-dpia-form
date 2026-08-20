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
    throw new Error('Bestand bevat geen DPIA-, pre-scan-, IAMA- of AIIA-antwoorden')
  }

  // Migrate v1 nanoid keys if needed (uses old taskInstances for ID mapping)
  const migrated = migrateStateV1toV2(json as any, {})

  // Normalize to unified format
  return normalizeToState(migrated as any, detectedType)
}

export type ImportType = 'dpia' | 'prescan' | 'iama' | 'aiia' | null

export const detectImportType = (json: Record<string, unknown>): ImportType => {
  const urn = (json.metadata as Record<string, unknown>)?.urn as string | undefined
  if (urn) {
    if (urn.startsWith('urn:nl:dpia')) return 'dpia'
    if (urn.startsWith('urn:nl:prescan')) return 'prescan'
    if (urn.startsWith('urn:nl:iama')) return 'iama'
    if (urn.startsWith('urn:nl:aiia')) return 'aiia'
  }

  const answers = json.answers as Record<string, unknown> | undefined
  if (answers?.[FormType.DPIA] && Object.keys(answers[FormType.DPIA] as object).length > 0) return 'dpia'
  if (answers?.[FormType.PRE_SCAN] && Object.keys(answers[FormType.PRE_SCAN] as object).length > 0) return 'prescan'
  if (answers?.[FormType.IAMA] && Object.keys(answers[FormType.IAMA] as object).length > 0) return 'iama'
  if (answers?.[FormType.AIIA] && Object.keys(answers[FormType.AIIA] as object).length > 0) return 'aiia'

  if (answers && Object.keys(answers).length > 0) {
    return 'dpia'
  }

  return null
}

// FormType for a metadata.urn, or null for legacy files without a known urn.
export const namespaceFromUrn = (urn: string | undefined): FormType | null => {
  if (!urn) return null
  if (urn.startsWith('urn:nl:dpia')) return FormType.DPIA
  if (urn.startsWith('urn:nl:prescan')) return FormType.PRE_SCAN
  if (urn.startsWith('urn:nl:iama')) return FormType.IAMA
  if (urn.startsWith('urn:nl:aiia')) return FormType.AIIA
  return null
}

// What a mismatching import is told it should have contained, per active form.
const MISMATCH_LABEL: Record<FormType, string> = {
  [FormType.IAMA]: 'IAMA-',
  [FormType.AIIA]: 'AIIA-',
  [FormType.DPIA]: 'DPIA- of pre-scan-',
  [FormType.PRE_SCAN]: 'pre-scan- of DPIA-',
}

// Reject an import that belongs to another form: DPIA and pre-scan accept each
// other's file (cross-form prefill), IAMA and AIIA only their own. Legacy files
// without urn cannot be classified reliably and are accepted as-is.
export const assertImportMatchesNamespace = (state: AssessmentState, active: FormType): void => {
  const detected = namespaceFromUrn(state.metadata.urn)
  if (!detected || detected === active) return
  const dpiaFamily = [FormType.DPIA, FormType.PRE_SCAN]
  if (dpiaFamily.includes(detected) && dpiaFamily.includes(active)) return
  throw new Error(`Dit bestand bevat geen ${MISMATCH_LABEL[active]}gegevens.`)
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
const NAMESPACE_BY_IMPORT_TYPE: Record<Exclude<ImportType, null>, FormType> = {
  dpia: FormType.DPIA,
  prescan: FormType.PRE_SCAN,
  iama: FormType.IAMA,
  aiia: FormType.AIIA,
}

export const normalizeToState = (json: Record<string, unknown>, detectedType: Exclude<ImportType, null>): AssessmentState => {
  const answers = json.answers as Record<string, unknown> | undefined
  const metadata = json.metadata as Record<string, unknown> | undefined
  const namespace = NAMESPACE_BY_IMPORT_TYPE[detectedType]

  // Detect old namespace-wrapped format and unwrap.
  const isNamespaced =
    answers?.[FormType.PRE_SCAN] || answers?.[FormType.DPIA] || answers?.[FormType.IAMA] || answers?.[FormType.AIIA]
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

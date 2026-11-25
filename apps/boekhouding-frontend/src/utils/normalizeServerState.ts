import {
  FormType,
  migrateStateV1toV2,
  useSchemaStore,
  type AssessmentState,
} from '@overheid-assessment/core'

/**
 * Normalize a stored server state to the unified AssessmentState format for
 * one namespace. Handles old namespace-keyed format and new flat format.
 * Returns answers in their original format (grouped arrays preserved)
 * so that rebuildRepeatableInstances can discover empty instances.
 */
export function normalizeServerState(serverData: any, ns: FormType): AssessmentState {
  if (!serverData?.metadata) {
    return { metadata: { createdAt: new Date().toISOString() }, answers: {} }
  }

  const schemaStore = useSchemaStore()
  const urnLookup: Record<string, string> = {}
  try { urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA) } catch { /* */ }
  try { urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN) } catch { /* */ }

  const migrated = migrateStateV1toV2(serverData as any, urnLookup)

  const answers = (migrated as any).answers || {}
  const metadata = migrated.metadata

  // Old format: answers wrapped in namespace key
  const isNamespaced = answers[FormType.DPIA] || answers[FormType.PRE_SCAN]

  let resolvedAnswers: Record<string, any>
  let completedTasks: string[]

  if (isNamespaced) {
    resolvedAnswers = answers[ns] || {}
    completedTasks = (migrated as any).taskState?.[ns]?.completedRootTaskIds
      || metadata.completedTasks || []
  } else {
    resolvedAnswers = answers
    completedTasks = metadata.completedTasks || []
  }

  return {
    metadata: {
      urn: metadata.urn,
      createdAt: metadata.createdAt,
      ...(completedTasks.length > 0 && { completedTasks }),
    },
    answers: resolvedAnswers,
  }
}

import { computed } from 'vue'
import type { FlatTask } from '../stores/tasks'
import type { AnswerValue } from '../stores/answers'
import { getPlainTextWithoutDefinitions } from '../utils/stripHtml'
import { useReferences, type PreScanReference } from './useReferences'

// Re-export the canonical PreScanReference type so existing consumers keep
// importing it from this module.
export type { PreScanReference }

/**
 * Backwards-compatible shim around the unified `useReferences` composable.
 *
 * The unified composable resolves both self- and cross-form references for the
 * active form. This shim preserves the original pre-scan-only public surface
 * (`findPreScanReferences`, `getPreviewDataForSection`, `getPreScanValueForTask`,
 * `hasPreScanReference`) so all existing consumers keep compiling and behaving
 * the same.
 */
export function usePreScanReferences() {
  const { getRootTaskId, findReferences, getPrefillValueForTask, getPreviewDataForSection } =
    useReferences()

  // Resolve cross-form references (e.g. pre-scan → DPIA) pointing at a task or
  // its section, optionally filtered by reference type, mapped to the legacy
  // PreScanReference shape. Reimplemented on top of the unified findReferences.
  const findPreScanReferences = (
    dpiaTaskId: string,
    referenceTypes?: string | string[],
    matchBySection: boolean = false,
  ): PreScanReference[] => {
    const typesToMatch: string[] = referenceTypes
      ? Array.isArray(referenceTypes)
        ? referenceTypes
        : [referenceTypes]
      : []

    return findReferences(dpiaTaskId, { matchBySection })
      .filter(({ scope }) => scope === 'cross')
      .filter(({ reference }) => typesToMatch.length === 0 || typesToMatch.includes(reference.type))
      .map(({ sourceTask, reference, answer }) => ({
        taskId: sourceTask.id,
        taskTitle: getPlainTextWithoutDefinitions(sourceTask.task),
        answer,
        referenceType: reference.type,
        dpiaTaskId: reference.id,
      }))
  }

  // Deterministic prefill value for a DPIA task (delegates to the unified
  // prefill resolver: prefill types only, string-boolean conversion).
  const getPreScanValueForTask = (task: FlatTask): AnswerValue | boolean => {
    return getPrefillValueForTask(task)
  }

  // True when any reference of the given type points at the task. Since
  // findReferences scans all namespaces, `.some(...)` on the reference type is
  // the faithful equivalent of the original implementation.
  const hasPreScanReference = computed(() => {
    return (task: FlatTask, referenceType: string): boolean =>
      findReferences(task.id).some(({ reference }) => reference.type === referenceType)
  })

  return {
    getRootTaskId,
    findPreScanReferences,
    getPreviewDataForSection,
    getPreScanValueForTask,
    hasPreScanReference,
  }
}

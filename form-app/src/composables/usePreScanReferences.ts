import { computed } from 'vue'
import { FormType } from '@/models/dpia.ts'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, type FlatTask } from '@/stores/tasks'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'

export interface PreScanReference {
  taskId: string;
  taskTitle: string;
  answer: string | string[] | null;
  referenceType: string;
  dpiaTaskId: string; // Store the referenced DPIA task ID
}

export function usePreScanReferences() {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  const getRootTaskId = (taskId: string): string => {
    return taskId.split('.')[0];
  }

  const findPreScanReferences = (
    dpiaTaskId: string,
    referenceTypes?: string | string[],
    matchBySection: boolean = false
  ): PreScanReference[] => {
    if (!dpiaTaskId) return []

    const results: PreScanReference[] = []
    const sectionId = getRootTaskId(dpiaTaskId)
    const preScanTasks = Object.values(taskStore.getTasksFromNamespace(FormType.PRE_SCAN))

    // Convert referenceTypes to array for consistent processing
    const typesToMatch: string[] = referenceTypes
      ? (Array.isArray(referenceTypes) ? referenceTypes : [referenceTypes])
      : []

    for (const task of preScanTasks) {
      if (!task.references || !task.references.DPIA) continue

      const references = task.references.DPIA

      // Function to check if a reference matches our criteria
      const matchesReference = (ref: { type: string, id: string }): boolean => {
        // If no types specified, match all types
        const refTypeMatches = typesToMatch.length === 0 || typesToMatch.includes(ref.type)

        // Match either by exact ID or by section
        const refIdMatches = matchBySection
          ? getRootTaskId(ref.id) === sectionId
          : ref.id === dpiaTaskId

        return refTypeMatches && refIdMatches
      }

      // Find matching references
      let matchingReferences: Array<{ type: string, id: string }> = []

      matchingReferences = references.filter(matchesReference)

      // Process matching references
      if (matchingReferences.length > 0) {
        // Get Pre-scan value
        const preScanInstanceIds = taskStore.getInstanceIdsForTaskFromNamespace(FormType.PRE_SCAN, task.id)

        if (preScanInstanceIds.length > 0) {
          const answer = answerStore.getAnswerFromNamespace(FormType.PRE_SCAN, preScanInstanceIds[0])

          if (answer !== null && answer !== undefined) {
            // Add each matching reference to results
            for (const ref of matchingReferences) {
              results.push({
                taskId: task.id,
                taskTitle: getPlainTextWithoutDefinitions(task.task),
                answer: answer,
                referenceType: ref.type,
                dpiaTaskId: ref.id
              })
            }
          }
        }
      }
    }

    return results
  }

  const getPreviewDataForSection = (dpiaTaskId: string): PreScanReference[] => {
    // Find all pre-view references in this section
    return findPreScanReferences(dpiaTaskId, ['pre-view', 'many-to-many'], true)
  }

  const getPreScanValueForTask = (task: FlatTask): any => {
    // Only apply to DPIA tasks
    if (taskStore.activeNamespace !== FormType.DPIA) {
      return null
    }

    // Find all references to this task
    const references = findPreScanReferences(task.id)

    // Process references based on type
    for (const ref of references) {

      // Skip pre-view references (handled separately)
      if (ref.referenceType === 'pre-view') {
        continue
      }

      // Convert string booleans to actual booleans
      const processedAnswer = ref.answer === 'true' ? true :
        ref.answer === 'false' ? false :
          ref.answer

      // We do not support one-to-many at this stage.
      if (ref.referenceType === 'pre-fill' || ref.referenceType === 'one-to-one' || ref.referenceType === 'one-to-many') {
        return processedAnswer
      }
    }

    return null
  }

  const hasPreScanReference = computed(() => {
    return (task: FlatTask, referenceType: string): boolean => {
      const references = findPreScanReferences(task.id, referenceType)
      return references.length > 0
    }
  })

  return {
    getRootTaskId,
    findPreScanReferences,
    getPreviewDataForSection,
    getPreScanValueForTask,
    hasPreScanReference
  }
}

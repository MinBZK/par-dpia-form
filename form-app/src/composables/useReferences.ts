import { FormType, type TaskReference } from '@/models/dpia.ts'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, type FlatTask } from '@/stores/tasks'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'

/**
 * A reference lives on a *source* task and points (via references[<KEY>]) at a
 * *target* task. The KEY names the form the target lives in, so references are
 * resolved while rendering that form (the active namespace). The source task
 * can live in the same form (self -> inline suggestion) or in another form
 * (cross, e.g. pre-scan -> DPIA -> prefill / section preview).
 *
 * Self vs. cross is derived from structure, not declared: the reference key
 * names the target form and the namespace the source task lives in is the
 * source form, so scope = (source namespace === target form) ? self : cross.
 *
 * What happens with a match is decided by the reference `type`:
 *   - pre-fill / one-to-one / one-to-many -> deterministically prefill the field
 *   - pre-view / many-to-many             -> show as suggestion / section preview
 */

// Reference key per form == the form the target task lives in.
const REFERENCE_KEY: Partial<Record<FormType, 'DPIA' | 'IAMA'>> = {
  [FormType.DPIA]: 'DPIA',
  [FormType.IAMA]: 'IAMA',
}

const ALL_NAMESPACES: FormType[] = [FormType.DPIA, FormType.PRE_SCAN, FormType.IAMA]

// Types that deterministically prefill the target field (vs. only previewing).
const PREFILL_TYPES = ['pre-fill', 'one-to-one', 'one-to-many']
const PREVIEW_TYPES = ['pre-view', 'many-to-many']

export type ReferenceScope = 'self' | 'cross'

export interface ReferenceMatch {
  sourceNamespace: FormType
  sourceTask: FlatTask
  reference: TaskReference
  scope: ReferenceScope
  answer: string | string[]
}

// Shape consumed by the section-level pre-scan preview.
export interface PreScanReference {
  taskId: string
  taskTitle: string
  answer: string | string[] | null
  referenceType: string
  dpiaTaskId: string
}

// Shape consumed by the inline suggestion block.
export interface ReferenceSuggestion {
  sourceTaskId: string
  sourceTaskTitle: string
  answer: string | string[]
}

export function useReferences() {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const getRootTaskId = (taskId: string): string => taskId.split('.')[0]

  /**
   * Find every reference (in any namespace) that points at `targetId` (or its
   * section, when matchBySection) under the active form's key, together with
   * the source task's current answer.
   */
  const findReferences = (
    targetId: string,
    options: { matchBySection?: boolean } = {},
  ): ReferenceMatch[] => {
    const targetForm = taskStore.activeNamespace
    const key = REFERENCE_KEY[targetForm]
    if (!key || !targetId) return []

    const { matchBySection = false } = options
    const sectionId = getRootTaskId(targetId)
    const results: ReferenceMatch[] = []

    for (const sourceNamespace of ALL_NAMESPACES) {
      const scope: ReferenceScope = sourceNamespace === targetForm ? 'self' : 'cross'
      const tasks = Object.values(taskStore.getTasksFromNamespace(sourceNamespace))

      for (const sourceTask of tasks) {
        const refs = sourceTask.references?.[key]
        if (!Array.isArray(refs)) continue

        const matching = refs.filter((ref) =>
          matchBySection ? getRootTaskId(ref.id) === sectionId : ref.id === targetId,
        )
        if (matching.length === 0) continue

        const instanceIds = taskStore.getInstanceIdsForTaskFromNamespace(sourceNamespace, sourceTask.id)
        if (instanceIds.length === 0) continue

        const answer = answerStore.getAnswerFromNamespace(sourceNamespace, instanceIds[0])
        if (answer === null || answer === undefined) continue

        for (const reference of matching) {
          results.push({ sourceNamespace, sourceTask, reference, scope, answer })
        }
      }
    }

    return results
  }

  /**
   * Deterministic prefill value for the rendered field, or null. Used by
   * FormField to seed the answer (e.g. a pre-scan answer flowing into DPIA).
   */
  const getPrefillValueForTask = (task: FlatTask): string | string[] | boolean | null => {
    for (const { reference, answer } of findReferences(task.id)) {
      if (!PREFILL_TYPES.includes(reference.type)) continue
      // Convert string booleans to actual booleans.
      if (answer === 'true') return true
      if (answer === 'false') return false
      return answer
    }
    return null
  }

  /**
   * Inline suggestions: intra-form (self) references that point at this task.
   * Excludes prefill types, which are written into the field instead of shown.
   */
  const getSuggestionsForTask = (task: FlatTask): ReferenceSuggestion[] => {
    const seen = new Set<string>()
    const suggestions: ReferenceSuggestion[] = []

    for (const { sourceTask, reference, scope, answer } of findReferences(task.id)) {
      if (scope !== 'self') continue
      if (PREFILL_TYPES.includes(reference.type)) continue
      // One suggestion per source task, even if it references the target twice.
      if (seen.has(sourceTask.id)) continue
      seen.add(sourceTask.id)

      suggestions.push({
        sourceTaskId: sourceTask.id,
        sourceTaskTitle: sourceTask.task,
        answer,
      })
    }

    return suggestions
  }

  /**
   * Section-level preview: cross-form (pre-scan) pre-view references for a
   * whole section. Used by PreScanPreview.
   */
  const getPreviewDataForSection = (sectionTaskId: string): PreScanReference[] => {
    return findReferences(sectionTaskId, { matchBySection: true })
      .filter(({ scope, reference }) => scope === 'cross' && PREVIEW_TYPES.includes(reference.type))
      .map(({ sourceTask, reference, answer }) => ({
        taskId: sourceTask.id,
        taskTitle: getPlainTextWithoutDefinitions(sourceTask.task),
        answer,
        referenceType: reference.type,
        dpiaTaskId: reference.id,
      }))
  }

  return {
    getRootTaskId,
    findReferences,
    getPrefillValueForTask,
    getSuggestionsForTask,
    getPreviewDataForSection,
  }
}

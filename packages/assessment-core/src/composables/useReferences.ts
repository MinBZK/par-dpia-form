import { FormType, type TaskReference } from '../models/dpia'
import { useAnswerStore, type AnswerValue } from '../stores/answers'
import { useTaskStore, type FlatTask } from '../stores/tasks'
import { getPlainTextWithoutDefinitions } from '../utils/stripHtml'

// A reference declared on a source task points at a task in either the DPIA or
// IAMA form. The reference key therefore identifies the form the *target* task
// lives in: when DPIA is active we look at `references.DPIA`, when IAMA is
// active at `references.IAMA`. Pre-scan tasks are only ever sources, never
// targets, so PRE_SCAN has no reference key.
const REFERENCE_KEY: Partial<Record<FormType, 'DPIA' | 'IAMA'>> = {
  [FormType.DPIA]: 'DPIA',
  [FormType.IAMA]: 'IAMA',
}

// References can originate from any form (self-references within the active
// form, or cross-form references from another form such as pre-scan).
const ALL_NAMESPACES: FormType[] = [FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA]

// Prefill reference types deterministically populate the target answer.
const PREFILL_TYPES = ['pre-fill', 'one-to-one', 'one-to-many']
// Preview reference types only surface the source answer as read-only context.
const PREVIEW_TYPES = ['pre-view', 'many-to-many']

// A reference is "self" when source and target live in the same form (used for
// in-form suggestions), and "cross" when the source lives in another form (used
// for prefill from pre-scan/DPIA↔IAMA and cross-form preview).
export type ReferenceScope = 'self' | 'cross'

export interface ReferenceMatch {
  sourceNamespace: FormType
  sourceTask: FlatTask
  reference: TaskReference
  scope: ReferenceScope
  answer: AnswerValue
}

export interface PreScanReference {
  taskId: string
  taskTitle: string
  answer: AnswerValue
  referenceType: string
  dpiaTaskId: string
}

export interface ReferenceSuggestion {
  sourceTaskId: string
  sourceTaskTitle: string
  answer: AnswerValue
}

export function useReferences() {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const getRootTaskId = (taskId: string): string => taskId.split('.')[0]

  // Scan every namespace for tasks whose references point at `targetId` (or, when
  // matchBySection is set, at any task in the same section as `targetId`) within
  // the active form. Returns one match per matching reference, annotated with the
  // source answer and whether it is a self- or cross-form reference.
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
        const instanceIds = taskStore.getInstanceIdsForTaskFromNamespace(
          sourceNamespace,
          sourceTask.id,
        )
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

  // Deterministic prefill value for a task: the first prefill-type reference's
  // answer, with string booleans converted to real booleans. Returns null when
  // no prefill reference applies.
  const getPrefillValueForTask = (task: FlatTask): AnswerValue | boolean => {
    for (const { reference, answer } of findReferences(task.id)) {
      if (!PREFILL_TYPES.includes(reference.type)) continue
      if (answer === 'true') return true
      if (answer === 'false') return false
      return answer
    }
    return null
  }

  // In-form suggestions: non-prefill self-references pointing at this task,
  // deduplicated per source task. Prefill references are excluded because they
  // are applied automatically rather than offered as a suggestion.
  const getSuggestionsForTask = (task: FlatTask): ReferenceSuggestion[] => {
    const seen = new Set<string>()
    const suggestions: ReferenceSuggestion[] = []
    for (const { sourceTask, reference, scope, answer } of findReferences(task.id)) {
      if (scope !== 'self') continue
      if (PREFILL_TYPES.includes(reference.type)) continue
      if (seen.has(sourceTask.id)) continue
      seen.add(sourceTask.id)
      suggestions.push({ sourceTaskId: sourceTask.id, sourceTaskTitle: sourceTask.task, answer })
    }
    return suggestions
  }

  // Cross-form preview data for a whole section: preview-type references coming
  // from another form (e.g. pre-scan answers shown read-only inside the DPIA).
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

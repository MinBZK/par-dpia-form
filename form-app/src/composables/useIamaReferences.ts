import { FormType } from '@/models/dpia.ts'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, type FlatTask } from '@/stores/tasks'

export interface IamaSuggestion {
  sourceTaskId: string
  sourceTaskTitle: string
  answer: string | string[]
}

export function useIamaReferences() {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  /**
   * Find all IAMA source answers that reference the given task.
   * Returns for each match the source answer and whether the source's
   * root task (Deel) is marked as completed.
   */
  const findIamaSourceAnswers = (
    task: FlatTask,
  ): Array<{
    sourceTaskId: string
    sourceTaskTitle: string
    answer: string | string[]
    isSourceCompleted: boolean
  }> => {
    if (taskStore.activeNamespace !== FormType.IAMA) return []

    const results: Array<{
      sourceTaskId: string
      sourceTaskTitle: string
      answer: string | string[]
      isSourceCompleted: boolean
    }> = []

    const iamaTasks = Object.values(taskStore.getTasksFromNamespace(FormType.IAMA))

    for (const sourceTask of iamaTasks) {
      if (!sourceTask.references || !sourceTask.references.IAMA) continue

      const hasMatch = sourceTask.references.IAMA.some((ref) => ref.id === task.id)
      if (!hasMatch) continue

      const instanceIds = taskStore.getInstanceIdsForTaskFromNamespace(FormType.IAMA, sourceTask.id)
      if (instanceIds.length === 0) continue

      const answer = answerStore.getAnswerFromNamespace(FormType.IAMA, instanceIds[0])
      if (answer === null || answer === undefined) continue

      const sourceRootId = sourceTask.id.split('.')[0]
      const isSourceCompleted = taskStore.isRootTaskCompleted(sourceRootId)

      results.push({
        sourceTaskId: sourceTask.id,
        sourceTaskTitle: sourceTask.task,
        answer,
        isSourceCompleted,
      })
    }

    return results
  }

  const isTargetInDeel5 = (task: FlatTask): boolean => task.id.startsWith('5.')

  /**
   * Pre-fill value: returned when the source's Deel is marked as completed,
   * OR when the target task is in Deel 5 (always deterministic there).
   * Used by FormField to deterministically set the answer.
   */
  const getIamaValueForTask = (task: FlatTask): string | string[] | null => {
    const found = findIamaSourceAnswers(task)
    if (found.length === 0) return null

    const forceCompleted = isTargetInDeel5(task)
    const eligible = found.find((f) => f.isSourceCompleted || forceCompleted)
    return eligible ? eligible.answer : null
  }

  /**
   * Suggestions: returned when the source's Deel is NOT yet marked as
   * completed (and the target is not in Deel 5). Used by FormField to
   * render a pop-up/preview block with the suggested value.
   */
  const getIamaSuggestionsForTask = (task: FlatTask): IamaSuggestion[] => {
    if (isTargetInDeel5(task)) return []
    return findIamaSourceAnswers(task)
      .filter((f) => !f.isSourceCompleted)
      .map(({ sourceTaskId, sourceTaskTitle, answer }) => ({
        sourceTaskId,
        sourceTaskTitle,
        answer,
      }))
  }

  return {
    getIamaValueForTask,
    getIamaSuggestionsForTask,
  }
}

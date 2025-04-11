import { type AnswerValue } from '@/stores/answers'
import { type FlatTask, type TaskInstance, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'

export function normalizeValue(value: string): string | boolean | null {
  if (value.toLowerCase() === 'true') {
    return true
  } else if (value.toLowerCase() === 'false') {
    return false
  } else if (value === 'null' || value === '') {
    return null
  }
  return value
}

export function hasInstanceMapping(task: FlatTask): boolean {
  return task.dependencies?.some((dep) => dep.type === 'instance_mapping') || false
}

export function shouldShowTask(taskId: string, instanceId: string, taskStore: TaskStoreType, answerStore: AnswerStoreType): boolean {
  const task = taskStore.taskById(taskId)
  const instance = taskStore.getInstanceById(instanceId)

  // If there are no dependencies, dependencies are void or there is no instance
  // we should show task.
  if (!task.dependencies || task.dependencies.length === 0 || !instance) {
    return true
  }

  for (const dependency of task.dependencies) {
    if (dependency.type == 'conditional') {
      // If the condition is void we should show task.
      if (!dependency.condition) {
        return true
      }

      const { id: conditionTaskId, operator, value } = dependency.condition
      const action = dependency.action

      // NOTE: We assume the conditionTaskId is within the same task group, i.e. we
      // assume that the conditionTaskId is an ancestor of taskId.
      const relatedInstance = taskStore.findRelatedInstance(conditionTaskId, instanceId)
      if (!relatedInstance) {
        continue
      }

      const conditionValue = answerStore.getAnswer(relatedInstance.id)

      // We need to parse the conditionValue if it is a string.
      let normalizedValue: AnswerValue | boolean = conditionValue
      if (typeof conditionValue === 'string') {
        normalizedValue = normalizeValue(conditionValue)
      }

      let conditionMet = false
      if (operator === 'equals') {
        conditionMet = normalizedValue === value
      } else if (operator === 'any') {
        conditionMet = true;
      } else {
        // Add more operators if needed.
        throw new Error(`got an unsuported operator ${operator}`)
      }

      // If the action is 'show' and the condition is non-void and is not met,
      // we should not show task.
      if (action === 'show' && !conditionMet) {
        return false
      }
    }
  }

  // We exhausted all possibilities of to not show task, so we should show task.
  return true
}

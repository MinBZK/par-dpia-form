import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'

export function renderInstanceLabel(
  instanceId: string,
  template: string
): string {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  const instance = taskStore.getInstanceById(instanceId)
  if (!instance) return template

  return template.replace(/\{([^}]+)\}/g, (match: string, fieldId: string): string => {
    const parentInstanceId = instance.parentInstanceId
    if (!parentInstanceId) return match

    const siblingInstanceIds = taskStore.getInstanceIdsForTask(fieldId, parentInstanceId)
    if (!siblingInstanceIds.length) return match

    const siblingInstanceId = siblingInstanceIds[0]
    const value = answerStore.getAnswer(siblingInstanceId)

    if (value === undefined || value == null) {
      return match
    }

    if (Array.isArray(value)) {
      return value.join(', ')

    }
    return String(value)
  })
}

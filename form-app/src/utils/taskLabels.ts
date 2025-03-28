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

  return template.replace(/\{([^}]+)\}/g, (match: string, _fieldId: string): string => {
    const originInstance = instance.mappedFromInstanceId
    if (!originInstance) return match

    const value = answerStore.getAnswer(originInstance)
    if (value == null) return ''

    return String(value)
  })
}

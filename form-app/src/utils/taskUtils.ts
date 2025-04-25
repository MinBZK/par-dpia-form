import { Task } from '@/models/dpia'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'

export function createConclusionTask(taskName: string, signingTaskId: string, description?: string): Task {
  return {
    task: taskName,
    id: signingTaskId,
    type: ['task_group', 'signing'],
    repeatable: false,
    description: description,
    tasks: [],
  }
}

export function renderInstanceLabel(instanceId: string, template: string): string {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  const instance = taskStore.getInstanceById(instanceId)
  if (!instance) return template

  return template.replace(/\{([^}]+)\}/g, (match: string): string => {
    const originInstance = instance.mappedFromInstanceId
    if (!originInstance) return match

    const value = answerStore.getAnswer(originInstance)
    if (value == null) return ''

    return String(value)
  })
}

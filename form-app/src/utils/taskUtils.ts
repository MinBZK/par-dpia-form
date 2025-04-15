import { Task } from '@/models/dpia'
import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'

export function createSigningTask(signingTaskId: string): Task {
  return {
    task: 'Ondertekening',
    id: signingTaskId,
    type: ['task_group', 'signing'],
    repeatable: false,
    description:
      'Zorg dat alle stappen als voltooid gemarkeerd zijn, zodat het formulier compleet is. Als je nog niet klaar bent, kun je het formulier ook opslaan en later weer verder gaan. Indien je klaar bent, kun je het formulier als PDF exporteren.',
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

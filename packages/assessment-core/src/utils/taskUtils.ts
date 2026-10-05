import { Task } from '../models/dpia'
import { useAnswerStore } from '../stores/answers'
import { type FlatTask, useTaskStore } from '../stores/tasks'
import { escapeHtml } from './escapeHtml'

export function createConclusionTask(
  taskName: string,
  signingTaskId: string,
  description?: string,
  informational: boolean = false,
): Task {
  return {
    task: taskName,
    id: signingTaskId,
    type: informational ? ['task_group', 'signing', 'informational'] : ['task_group', 'signing'],
    repeatable: false,
    description: description,
    tasks: [],
  }
}

// A task_group without child tasks only carries a heading and description
// (e.g. the IAMA introduction or a "Stop" warning); it is never answered.
export function isTextBlock(task: FlatTask): boolean {
  return task.type.includes('task_group') && task.childrenIds.length === 0
}

export function removeTemplatePattern(input: string): string {
  const withoutBraces = input.replace(/\s*\{[^}]*\}/g, '');
  return withoutBraces.trim();
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
    // Legend renders this via v-html (schema definition markup), so escape the user value.
    return escapeHtml(String(value))
  })
}

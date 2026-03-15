import { type FlatTask, type TaskStoreType } from '../stores/tasks'
import { type AnswerStoreType } from '../stores/answers'
import { FormType } from '../models/dpia'
import { getPlainTextWithoutDefinitions } from './stripHtml'
import { hasInstanceMapping, shouldShowTask } from './dependency'
import { renderInstanceLabel } from './taskUtils'
import { generateFilename } from './fileName'

export async function exportToMarkdown(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  filename?: string,
): Promise<void> {
  const activeNamespace = taskStore.activeNamespace
  const formType = activeNamespace === FormType.DPIA ? 'DPIA' : 'Pre-scan DPIA'
  const lines: string[] = []

  lines.push(`# ${formType}`)
  lines.push('')
  lines.push(`*Gegenereerd op ${new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date())}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  const rootTasks = taskStore.getRootTasks.filter(task => !task.type.includes('signing'))

  if (activeNamespace === FormType.DPIA) {
    buildDpiaSections(lines, rootTasks, taskStore, answerStore)
  } else {
    buildPreScanSections(lines, rootTasks, taskStore, answerStore)
  }

  const md = lines.join('\n')
  const actualFilename = filename || generateFilename(activeNamespace, 'md')
  downloadFile(md, actualFilename, 'text/markdown')
}

function buildDpiaSections(
  lines: string[],
  rootTasks: FlatTask[],
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
) {
  const metadataTask = rootTasks.find(t => t.id === '19')
  const managementSummaryTask = rootTasks.find(t => t.id === '18')
  const officialTasks = rootTasks.filter(t => t.is_official_id)

  if (metadataTask) {
    buildSection(lines, metadataTask, taskStore, answerStore, 2)
  }
  if (managementSummaryTask) {
    buildSection(lines, managementSummaryTask, taskStore, answerStore, 2)
  }

  let sectionNumber = 1
  for (const task of officialTasks) {
    buildNumberedSection(lines, task, taskStore, answerStore, sectionNumber, 2)
    sectionNumber++
  }
}

function buildPreScanSections(
  lines: string[],
  rootTasks: FlatTask[],
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
) {
  let sectionNumber = 1
  for (const task of rootTasks) {
    buildNumberedSection(lines, task, taskStore, answerStore, sectionNumber, 2)
    sectionNumber++
  }
}

function buildSection(
  lines: string[],
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  headingLevel: number,
) {
  const prefix = '#'.repeat(headingLevel)
  lines.push(`${prefix} ${getPlainTextWithoutDefinitions(task.task)}`)
  lines.push('')

  if (task.description) {
    lines.push(`*${getPlainTextWithoutDefinitions(task.description)}*`)
    lines.push('')
  }

  buildAnswerContent(lines, task, taskStore, answerStore, headingLevel + 1)
}

function buildNumberedSection(
  lines: string[],
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  sectionNumber: number,
  headingLevel: number,
) {
  const prefix = '#'.repeat(headingLevel)
  lines.push(`${prefix} ${sectionNumber}. ${getPlainTextWithoutDefinitions(task.task)}`)
  lines.push('')

  if (task.description) {
    lines.push(`*${getPlainTextWithoutDefinitions(task.description)}*`)
    lines.push('')
  }

  buildAnswerContent(lines, task, taskStore, answerStore, headingLevel + 1)
}

function buildAnswerContent(
  lines: string[],
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  headingLevel: number,
) {
  if (task.type?.includes('task_group') && task.childrenIds?.length > 0) {
    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      const prefix = '#'.repeat(Math.min(headingLevel, 6))
      lines.push(`${prefix} ${getPlainTextWithoutDefinitions(childTask.task)}`)
      lines.push('')
      processTaskWithInstances(lines, childTask, null, taskStore, answerStore, 0)
    }
  } else {
    const instanceId = taskStore.getRootTaskInstanceIds(task.id)[0]
    const answer = answerStore.getAnswer(instanceId)
    lines.push(formatAnswerValue(answer))
    lines.push('')
  }
}

function processTaskWithInstances(
  lines: string[],
  task: FlatTask,
  parentInstanceId: string | null,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  nestingLevel: number,
) {
  let instanceIds: string[]

  if (parentInstanceId && hasInstanceMapping(task)) {
    instanceIds = Object.values(taskStore.taskInstances[taskStore.activeNamespace])
      .filter(i => i.taskId === task.id && i.mappedFromInstanceId === parentInstanceId)
      .map(i => i.id)
  } else {
    instanceIds = parentInstanceId
      ? taskStore.getInstanceIdsForTask(task.id, parentInstanceId)
      : taskStore.getInstanceIdsForTask(task.id)
  }

  if (instanceIds.length === 0) return

  // Simple task
  if (!task.childrenIds || task.childrenIds.length === 0) {
    for (const instanceId of instanceIds) {
      if (shouldShowTask(task.id, instanceId, taskStore, answerStore)) {
        const answer = answerStore.getAnswer(instanceId)
        lines.push(formatAnswerValue(answer))
        lines.push('')
      }
    }
    return
  }

  // Task group with children
  for (const instanceId of instanceIds) {
    if (!shouldShowTask(task.id, instanceId, taskStore, answerStore)) continue

    // Instance label
    if (task.instance_label_template) {
      const label = renderInstanceLabel(instanceId, task.instance_label_template)
      lines.push(`**${getPlainTextWithoutDefinitions(label)}**`)
      lines.push('')
    }

    // Simple child fields as a table
    const tableRows: [string, string][] = []
    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      if (childTask.childrenIds && childTask.childrenIds.length > 0) continue

      const childInstanceIds = taskStore.getInstanceIdsForTask(childId, instanceId)
      for (const childInstanceId of childInstanceIds) {
        if (!shouldShowTask(childId, childInstanceId, taskStore, answerStore)) continue
        const value = answerStore.getAnswer(childInstanceId)
        tableRows.push([
          getPlainTextWithoutDefinitions(childTask.task),
          formatAnswerValue(value),
        ])
      }
    }

    if (tableRows.length > 0) {
      lines.push('| Vraag | Antwoord |')
      lines.push('|---|---|')
      for (const [question, answer] of tableRows) {
        lines.push(`| ${question.replace(/\|/g, '\\|')} | ${answer.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)
      }
      lines.push('')
    }

    // Complex child tasks
    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      if (!childTask.childrenIds || childTask.childrenIds.length === 0) continue
      processTaskWithInstances(lines, childTask, instanceId, taskStore, answerStore, nestingLevel + 1)
    }
  }
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '*Niet ingevuld*'
  }
  if (Array.isArray(value)) {
    const items = value
      .filter(item => item !== null && item !== undefined)
      .map(item => getPlainTextWithoutDefinitions(String(item)))
      .filter(item => item.trim() !== '')
    return items.length > 0 ? items.map(i => `- ${i}`).join('\n') : '*Niet ingevuld*'
  }
  if (value === 'true') return 'Ja'
  if (value === 'false') return 'Nee'
  if (value === 'null') return '*Niet ingevuld*'
  return value ? getPlainTextWithoutDefinitions(String(value)) : '*Niet ingevuld*'
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

import { type FlatTask, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import * as pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import type { StyleDictionary, TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import { renderInstanceLabel } from '@/utils/taskUtils'
import { hasInstanceMapping, shouldShowTask } from '@/utils/dependency'
import { generateFilename } from './fileName'

// Initialize PDFMake
;(<any>pdfMake).addVirtualFileSystem(pdfFonts)

export async function exportToPdf(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  filename?: string,
): Promise<void> {
  const dpiaStyleDictionary: StyleDictionary = {
    title: {
      fontSize: 28,
      bold: true,
      margin: [0, 0, 0, 10],
      color: '#154273', // RVO blue
    },
    subtitle: {
      fontSize: 18,
      margin: [0, 15, 0, 0],
      color: '#333333',
    },
    subsubtitle: {
      fontSize: 14,
      margin: [0, 40, 0, 0],
      color: '#666666',
      italics: true,
    },
    header: {
      fontSize: 24,
      bold: true,
      margin: [0, 0, 0, 20],
      color: '#154273', // RVO blue
    },
    subHeader: {
      fontSize: 16,
      bold: true,
      margin: [0, 15, 0, 10],
      color: '#154273', // RVO blue
    },
    subSubHeader: {
      fontSize: 14,
      bold: true,
      margin: [0, 10, 0, 5],
    },
    description: {
      fontSize: 11,
      margin: [0, 0, 0, 15],
    },
    normal: {
      fontSize: 11,
    },
    tableHeader: {
      fontSize: 12,
      bold: true,
      color: '#154273',
    },
    tableExample: {
      margin: [0, 5, 0, 15],
    },
  }

  try {
    const docDefinition: TDocumentDefinitions = {
      content: [
        // Cover page
        {
          stack: [
            { text: 'Data Protection Impact Assessment', style: 'title' },
            { text: 'DPIA Rapportagemodel', style: 'subtitle' },
            {
              text: `Gegenereerd met de 'DPIA Rapportagemodel Editor' op ${new Date().toISOString()}`,
              style: 'subsubtitle',
            },
          ],
          alignment: 'center',
          margin: [0, 150, 0, 0],
          pageBreak: 'after',
        },

        // Table of contents
        {
          toc: {
            title: { text: 'Inhoudsopgave', style: 'header' },
          },
        },

        // Contents
        ...taskStore.getRootTasks
          .filter((task) => !task.type.includes('signing'))
          .map((task) => buildSection(task, taskStore, answerStore)),
      ],

      // Page numbers
      footer: function (currentPage, pageCount) {
        return {
          text: `Pagina ${currentPage} van ${pageCount}`,
          alignment: 'center',
          margin: [0, 0, 40, 0],
          color: '#999999',
          fontSize: 10,
        }
      },

      // Document metadata
      info: {
        title: 'DPIA Rapportagemodel',
        author: 'DPIA Rapportagemodel Editor',
        creator: 'DPIA Rapportagemodel Editor',
      },

      // Page styling
      pageSize: 'A4',
      pageMargins: [70, 70, 70, 70],
      styles: dpiaStyleDictionary,
    }

    const actualFilename = filename || 'DPIA_Rapportagemodel.pdf'
    pdfMake.createPdf(docDefinition).download(actualFilename)

    return Promise.resolve()
  } catch (error) {
    return Promise.reject(new Error('Failed to export PDF'))
  }
}

function buildSection(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Content {
  const contentElements: Content = [buildSectionTitle(task.id, task.task)]

  if (task.description) {
    contentElements.push(buildSectionDesciption(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

function buildSectionTitle(taskId: string, taskName: string): Content {
  return {
    text: `${taskId}.  ${taskName}`,
    style: 'header',
    tocItem: true,
  }
}

function buildSectionDesciption(description?: string): Content {
  return {
    stack: [
      { text: 'Beschrijving', style: 'subSubHeader' },
      { text: `${description}`, style: 'description' },
    ],
  }
}

/**
 * Formats answer values for display in the PDF
 */
function formatAnswerValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join(', ')
  } else if (value === 'true') {
    return 'Ja'
  } else if (value === 'false') {
    return 'Nee'
  } else if (value === 'null') {
    return ''
  }
  return value ? String(value) : ''
}

/*
/**
 * Main entry point for rendering task content
 */
function buildAnswer(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Content {
  // Root task with children
  if (task.type?.includes('task_group') && task.childrenIds?.length > 0) {
    const childElements: Content[] = []

    // Process each child of the root task
    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      childElements.push({ text: childTask.task, style: 'subSubHeader' })

      // Process child task and its instances
      const contentItems = processTaskWithInstances(childTask, null, taskStore, answerStore, 0)
      if (contentItems.length > 0) {
        childElements.push(...contentItems)
      }
    }

    return { stack: childElements }
  }
  // Simple task
  else {
    const instanceId = taskStore.getRootTaskInstanceIds(task.id)[0]
    const answer = answerStore.getAnswer(instanceId)
    return { text: formatAnswerValue(answer), style: 'normal' }
  }
}

function processTaskWithInstances(
  task: FlatTask,
  parentInstanceId: string | null,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  nestingLevel: number,
): Content[] {
  const elements: Content[] = []

  // Get instances for this task
  let instanceIds: string[] = []

  if (parentInstanceId && hasInstanceMapping(task)) {
    // For instance-mapped tasks, find instances mapped to this parent
    instanceIds = findMappedInstances(task.id, parentInstanceId, taskStore)
  } else {
    // Regular child tasks
    instanceIds = parentInstanceId
      ? taskStore.getInstanceIdsForTask(task.id, parentInstanceId)
      : taskStore.getInstanceIdsForTask(task.id)
  }

  // Skip if no instances
  if (instanceIds.length === 0) {
    return elements
  }

  // Simple task (no children)
  if (!task.childrenIds || task.childrenIds.length === 0) {
    for (const instanceId of instanceIds) {
      if (shouldShowTask(task.id, instanceId, taskStore, answerStore)) {
        const answer = answerStore.getAnswer(instanceId)
        elements.push({
          text: formatAnswerValue(answer),
          style: 'normal',
          margin: [nestingLevel * 10, 0, 0, 5],
        })
      }
    }
    return elements
  }

  // Task group with children
  if (nestingLevel > 0 && instanceIds.length > 0 && task.repeatable) {
    // Add category title for repeatable nested groups
    elements.push({
      text: task.task,
      style: 'category',
      margin: [nestingLevel * 10, 10, 0, 5],
    })
  }

  // Process each instance of this task
  for (const instanceId of instanceIds) {
    // Skip if this instance shouldn't be shown
    if (!shouldShowTask(task.id, instanceId, taskStore, answerStore)) {
      continue
    }

    // Create table for this instance's simple fields
    const tableRows = buildTableRows(instanceId, task, taskStore, answerStore)
    if (tableRows.length > 1) {
      // If there's more than just the header
      elements.push(createTableElement(tableRows, ['35%', '65%'], nestingLevel * 10))
    }

    // Process each child task that has its own complex structure
    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)

      // Skip simple fields (they're already in the table)
      if (!childTask.childrenIds || childTask.childrenIds.length === 0) {
        continue
      }

      // Recursively process this child and its instances
      const childElements = processTaskWithInstances(
        childTask,
        instanceId,
        taskStore,
        answerStore,
        nestingLevel + 1,
      )

      if (childElements.length > 0) {
        elements.push(...childElements)
      }
    }
  }

  return elements
}

/**
 * Find instances that are mapped from a specific parent instance
 */
function findMappedInstances(
  taskId: string,
  parentInstanceId: string,
  taskStore: TaskStoreType,
): string[] {
  return Object.values(taskStore.taskInstances)
    .filter(
      (instance) =>
        instance.taskId === taskId && instance.mappedFromInstanceId === parentInstanceId,
    )
    .map((instance) => instance.id)
}

/**
 * Build table rows for a task instance
 */
function buildTableRows(
  instanceId: string,
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): any[][] {
  const tableRows: any[][] = []

  // Add header row with instance label
  const instanceLabel = task.instance_label_template
    ? renderInstanceLabel(instanceId, task.instance_label_template)
    : task.task

  tableRows.push([
    {
      text: instanceLabel,
      style: 'tableHeader',
      colSpan: 2,
      margin: [0, 3, 0, 3],
    },
    {},
  ])

  // Add rows for each simple child field
  for (const childId of task.childrenIds) {
    const childTask = taskStore.taskById(childId)

    // Skip complex child tasks (with children)
    if (childTask.childrenIds && childTask.childrenIds.length > 0) {
      continue
    }

    // Get instances of this child task
    const childInstanceIds = taskStore.getInstanceIdsForTask(childId, instanceId)

    for (const childInstanceId of childInstanceIds) {
      // Skip if this child shouldn't be shown
      if (!shouldShowTask(childId, childInstanceId, taskStore, answerStore)) {
        continue
      }

      const value = answerStore.getAnswer(childInstanceId)
      tableRows.push([
        {
          text: childTask.task,
          bold: true,
          margin: [0, 3, 0, 3],
          fillColor: '#f5f5f5',
        },
        {
          text: formatAnswerValue(value),
          margin: [0, 3, 0, 3],
        },
      ])
    }
  }

  return tableRows
}

/**
 * Create a styled table element
 */
function createTableElement(
  rows: any[][],
  widths: any[] = ['35%', '65%'],
  leftMargin: number = 0,
): Content {
  if (rows.length <= 1) {
    // Skip if only header row or empty
    return { text: '' }
  }

  return {
    style: 'tableExample',
    margin: [leftMargin, 5, 0, 10],
    table: {
      widths: widths,
      body: rows,
    },
  }
}

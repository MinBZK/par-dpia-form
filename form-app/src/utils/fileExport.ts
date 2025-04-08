import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type Answer } from '@/stores/answers'
import { type FlatTask, type TaskInstance } from '@/stores/tasks'
import { generateTableForTaskGroup, shouldRenderAsTable } from '@/utils/tableBuilder'
import * as pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from 'pdfmake/build/vfs_fonts';


(<any>pdfMake).addVirtualFileSystem(pdfFonts);


export function downloadJsonFile(data: unknown, filename: string): void {
  try {
    const jsonString = JSON.stringify(data, null, 4);
    const blob = new Blob([jsonString], { type: 'application/json' })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename

    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error in creating download file:', error)
    throw new Error('Failed to create download file')
  }
}

export async function readJsonFile(file: File): Promise<DPIASnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target || typeof event.target.result !== 'string') {
          reject(new Error('Could not read given file'))
          return
        }

        const data = JSON.parse(event.target.result) as DPIASnapshot

        if (!data.metadata || !data.taskState || !data.answers) {
          reject(new Error('File contains format incompatible with DPIASnapshot structure'))
          return
        }

        resolve(data)
      } catch (error) {
        if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error('Could not process file'))
        }
      }
    }

    reader.onerror = () => {
      reject(new Error('There was an error reading the file'))
    }

    reader.readAsText(file)
  })
}

/**
 * Comprehensive PDF export utility for DPIA application
 */

// Define types for better type safety
interface PdfExportOptions {
  includeEmptyFields?: boolean
  filename?: string
  language?: string
  useTablesForRepeatableTasks?: boolean
}

// Default export options
const DEFAULT_OPTIONS: PdfExportOptions = {
  includeEmptyFields: false,
  filename: 'DPIA_Export.pdf',
  language: 'nl-NL',
  useTablesForRepeatableTasks: true
}

/**
 * Generate a complete DPIA PDF with all form data
 * @param rootTasks - All root level tasks
 * @param flatTasks - Map of all tasks
 * @param taskInstances - Map of all task instances
 * @param answers - All form answers
 * @param options - Export configuration options
 */
export async function exportDpiaToPdf(
  rootTasks: FlatTask[],
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
  options: PdfExportOptions = {}
): Promise<void> {
  // Merge with default options
  const exportOptions = { ...DEFAULT_OPTIONS, ...options }

  try {
    // Show loading indicator
    const loadingElement = document.createElement('div')
    loadingElement.className = 'pdf-export-loading'
    loadingElement.innerHTML = `
      <div class="pdf-export-loading-content">
        <div class="rvo-icon rvo-icon-refresh"></div>
        <span>PDF aan het genereren...</span>
      </div>
    `
    loadingElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 9999;
    `
    document.body.appendChild(loadingElement)
    // Create document definition
    const docDefinition = await buildDocDefinition(
      rootTasks,
      flatTasks,
      taskInstances,
      answers,
      exportOptions
    )

    // Generate and download PDF
    pdfMake.createPdf(docDefinition).download(exportOptions.filename)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    // Remove loading indicator
    const loadingElement = document.querySelector('.pdf-export-loading')
    if (loadingElement) {
      document.body.removeChild(loadingElement)
    }
  }
}

/**
 * Build the complete PDF document definition
 */
async function buildDocDefinition(
  rootTasks: FlatTask[],
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
  options: PdfExportOptions
): Promise<any> {
  // Create document content
  const content: any[] = [
    // Cover page
    {
      stack: [
        { text: 'Data Protection Impact Assessment', style: 'title' },
        { text: 'DPIA Rapportagemodel', style: 'subtitle' },
        { text: `Gegenereerd op ${new Date().toLocaleDateString(options.language)}`, style: 'dateText' },
      ],
      alignment: 'center',
      margin: [0, 150, 0, 0]
    },
    { text: '', pageBreak: 'after' },

    // Table of contents
    {
      stack: [
        { text: 'Inhoudsopgave', style: 'header' },
        { text: '', margin: [0, 20, 0, 0] },
        buildTableOfContents(rootTasks),
      ],
      pageBreak: 'after'
    },

    // Document content sections
    ...rootTasks.map(task => buildSectionContent(
      task,
      flatTasks,
      taskInstances,
      answers,
      options
    ))
  ]

  // Document definition with styling
  return {
    content,
    styles: {
      title: {
        fontSize: 28,
        bold: true,
        margin: [0, 0, 0, 10],
        color: '#154273' // RVO blue
      },
      subtitle: {
        fontSize: 18,
        margin: [0, 15, 0, 0],
        color: '#333333'
      },
      dateText: {
        fontSize: 14,
        margin: [0, 40, 0, 0],
        color: '#666666',
        italics: true
      },
      header: {
        fontSize: 24,
        bold: true,
        margin: [0, 0, 0, 20],
        color: '#154273' // RVO blue
      },
      sectionHeader: {
        fontSize: 18,
        bold: true,
        margin: [0, 15, 0, 10],
        color: '#154273' // RVO blue
      },
      subsectionHeader: {
        fontSize: 16,
        bold: true,
        margin: [0, 10, 0, 5]
      },
      taskHeader: {
        fontSize: 14,
        bold: true,
        margin: [0, 10, 0, 5]
      },
      normal: {
        fontSize: 12,
        margin: [0, 5, 0, 5]
      },
      tableHeader: {
        fontSize: 12,
        bold: true,
        color: '#ffffff',
        fillColor: '#154273',
        alignment: 'center'
      },
      tableCell: {
        fontSize: 11
      },
      toc: {
        fontSize: 12,
        margin: [0, 3, 0, 3]
      },
      tocTaskNumber: {
        width: 30,
        bold: true
      }
    },
    defaultStyle: {
      fontSize: 12,
      color: '#333333'
    },
    pageMargins: [40, 60, 40, 60],
    footer: function(currentPage, pageCount) {
      return {
        columns: [
          {
            text: 'DPIA Rapportagemodel',
            alignment: 'left',
            margin: [40, 0, 0, 0],
            color: '#999999',
            fontSize: 10
          },
          {
            text: `Pagina ${currentPage} van ${pageCount}`,
            alignment: 'right',
            margin: [0, 0, 40, 0],
            color: '#999999',
            fontSize: 10
          }
        ]
      }
    },
    info: {
      title: 'DPIA Rapportagemodel',
      author: 'Gegenereerd door DPIA applicatie',
      subject: 'Data Protection Impact Assessment',
      creator: 'DPIA Tool'
    }
  }
}

/**
 * Build table of contents
 */
function buildTableOfContents(rootTasks: FlatTask[]): any {
  return {
    layout: 'noBorders',
    table: {
      widths: ['auto', '*', 'auto'],
      body: rootTasks.map(task => {
        // Format section title - special case for task.id '0' or signing task
        const taskNumber = (task.id === '0' || task.type?.includes('signing'))
          ? ''
          : task.id

        return [
          { text: taskNumber, style: 'tocTaskNumber' },
          { text: task.task, style: 'toc' },
          { text: '', style: 'toc' } // Page numbers would go here in a real TOC
        ]
      })
    }
  }
}

/**
 * Build content for a section
 */
function buildSectionContent(
  task: FlatTask,
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
  options: PdfExportOptions
): any {
  // Format section title
  const title = (task.id === '0' || task.type?.includes('signing'))
    ? task.task
    : `${task.id}. ${task.task}`

  const content: any[] = [
    { text: title, style: 'header', pageBreak: 'before' }
  ]

  // Add description if available
  if (task.description) {
    content.push({ text: task.description, style: 'normal', margin: [0, 0, 0, 15] })
  }

  // Get all direct child tasks
  const childTasks = task.childrenIds?.map(id => flatTasks[id]) || []

  // Process each child task - check if it should be rendered as a table
  if (options.useTablesForRepeatableTasks) {
    childTasks.forEach(childTask => {
      if (childTask && shouldRenderAsTable(childTask.id, flatTasks, taskInstances)) {
        content.push(
          { text: childTask.task, style: 'sectionHeader', margin: [0, 15, 0, 10] },

          // If the child task has a description, include it
          ...(childTask.description ? [
            { text: childTask.description, style: 'normal', margin: [0, 0, 0, 10] }
          ] : []),

          // Generate table for this repeatable task group
          generateTableForTaskGroup(
            childTask.id,
            flatTasks,
            taskInstances,
            answers,
            {
              tableLayout: 'lightHorizontalLines',
              margin: [0, 10, 0, 20],
              includeEmptyFields: options.includeEmptyFields
            }
          )
        )
      }
    })
  }

  // Get instances for this root task
  const directInstances = Object.values(taskInstances)
    .filter(instance => instance.taskId === task.id)

  // Get all child tasks recursively
  const childTaskIds = getAllChildTaskIds(task.id, flatTasks)

  // Find orphaned instances for any task in this hierarchy
  const orphanedInstances = Object.values(taskInstances)
    .filter(instance =>
      instance.parentInstanceId === null &&
      childTaskIds.includes(instance.taskId)
    )

  // Process direct instances (these follow proper hierarchy)
  directInstances.forEach(instance => {
    content.push(...renderTaskInstance(
      instance,
      flatTasks,
      taskInstances,
      answers,
      options,
      0
    ))
  })

  // Process orphaned instances if they belong to immediate children
  // (only process top-level orphans to avoid duplicates)
  orphanedInstances
    .filter(instance => {
      const instanceTask = flatTasks[instance.taskId]
      return instanceTask && instanceTask.parentId === task.id
    })
    .forEach(instance => {
      // Skip instances of task groups that were already rendered as tables
      if (options.useTablesForRepeatableTasks) {
        const instanceTask = flatTasks[instance.taskId]
        if (instanceTask && shouldRenderAsTable(instanceTask.id, flatTasks, taskInstances)) {
          return
        }
      }

      content.push(...renderTaskInstance(
        instance,
        flatTasks,
        taskInstances,
        answers,
        options,
        1 // Start these at depth 1 since they're children
      ))
    })

  return content
}

/**
 * Recursively render a task instance and its children
 */
function renderTaskInstance(
  instance: TaskInstance,
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
  options: PdfExportOptions,
  depth: number
): any[] {
  const content: any[] = []
  const task = flatTasks[instance.taskId]

  if (!task) return content

  // Skip task groups that were already rendered as tables
  if (options.useTablesForRepeatableTasks &&
    depth > 0 &&
    shouldRenderAsTable(task.id, flatTasks, taskInstances)) {
    return content
  }

  // Check if this is a task group that should have its own heading
  const isTaskGroup = task.type?.includes('task_group')

  // Add task group header if needed
  if (isTaskGroup && depth > 0) {
    // For task groups, add a heading with the task name
    content.push({
      text: task.task,
      style: depth === 1 ? 'subsectionHeader' : 'taskHeader',
      margin: [depth * 10, 10, 0, 5]
    })

    // Add description if available
    if (task.description) {
      content.push({
        text: task.description,
        style: 'normal',
        margin: [(depth * 10) + 5, 0, 0, 10],
        italics: true
      })
    }
  }

  // Determine if this task has a direct answer
  const hasDirectAnswer = task.type?.some(type =>
    ['text_input', 'open_text', 'select_option', 'radio_option', 'checkbox_option', 'date'].includes(type)
  )

  // Render this task's answer if it has one
  if (hasDirectAnswer) {
    const answer = answers[instance.id]?.value

    // Only show if there's an answer or we're including empty fields
    if (answer || options.includeEmptyFields) {
      content.push(renderTaskAnswer(task, answer, depth))
    }
  }

  // Recursively render child tasks
  if (instance.childInstanceIds?.length) {
    const childInstances = instance.childInstanceIds
      .map(id => taskInstances[id])
      .filter(instance => instance !== undefined)

    // Sort child instances by their task IDs to maintain order
    childInstances.sort((a, b) => {
      const taskA = flatTasks[a.taskId]
      const taskB = flatTasks[b.taskId]
      return taskA.id.localeCompare(taskB.id, undefined, { numeric: true })
    })

    // Process child instances
    childInstances.forEach(childInstance => {
      // Skip task groups that were already rendered as tables
      if (options.useTablesForRepeatableTasks) {
        const childTask = flatTasks[childInstance.taskId]
        if (childTask && shouldRenderAsTable(childTask.id, flatTasks, taskInstances)) {
          return
        }
      }

      content.push(...renderTaskInstance(
        childInstance,
        flatTasks,
        taskInstances,
        answers,
        options,
        depth + (isTaskGroup ? 1 : 0)
      ))
    })
  }

  return content
}

/**
 * Render a single task answer
 */
function renderTaskAnswer(task: FlatTask, answer: any, depth: number): any {
  // Determine indentation and styling based on depth
  const margin = [depth * 10, 5, 0, 5]
  const labelStyle = depth === 0 ? 'taskHeader' : (depth === 1 ? 'subsectionHeader' : 'normal')

  // Don't show task group headings here as they're handled separately
  if (task.type?.includes('task_group') && !task.type?.some(t =>
    ['text_input', 'open_text', 'select_option', 'radio_option', 'checkbox_option', 'date'].includes(t))) {
    return {}
  }

  // Format different answer types
  let formattedAnswer: any = null
  let isEmptyAnswer = !answer || (Array.isArray(answer) && answer.length === 0)

  // Handle different task types
  if (task.type?.includes('open_text')) {
    // For multi-line text, return a text block
    return {
      stack: [
        { text: task.task, style: labelStyle, margin },
        {
          text: answer || '(Niet ingevuld)',
          style: 'normal',
          color: isEmptyAnswer ? '#999999' : '#000000',
          margin: [margin[0] + 10, 5, 0, 10],
          italics: isEmptyAnswer
        }
      ]
    }
  }
  else if (task.type?.includes('select_option') && task.options) {
    // For select options, show the selected option
    const option = task.options.find(opt => String(opt.value) === String(answer))
    formattedAnswer = option ?
      String(option.label || option.value) :
      (answer ? String(answer) : '(Niet ingevuld)')
    isEmptyAnswer = !answer
  }
  else if (task.type?.includes('radio_option') && task.options) {
    // For radio options, show the selected option with label if available
    const option = task.options.find(opt => String(opt.value) === String(answer))
    formattedAnswer = option ?
      String(option.label || option.value) :
      (answer ? String(answer) : '(Niet ingevuld)')
    isEmptyAnswer = !answer
  }
  else if (task.type?.includes('checkbox_option') && Array.isArray(answer)) {
    // For checkbox options, show all selected options
    formattedAnswer = answer.length > 0 ?
      answer.join(', ') :
      '(Geen opties geselecteerd)'
    isEmptyAnswer = answer.length === 0
  }
  else if (task.type?.includes('date') && answer) {
    // Format date in Dutch format
    try {
      const dateObj = new Date(answer)
      formattedAnswer = isNaN(dateObj.getTime()) ?
        answer :
        dateObj.toLocaleDateString('nl-NL')
    } catch (e) {
      formattedAnswer = answer
    }
    isEmptyAnswer = !answer
  }
  else {
    // Default handling for text input and other types
    formattedAnswer = answer ? String(answer) : '(Niet ingevuld)'
    isEmptyAnswer = !answer
  }

  // Calculate column widths based on depth
  // Less indentation means more space for the label, more indentation means less
  const labelWidth = Math.max(30, 50 - (depth * 5))

  // Return formatted answer row
  return {
    columns: [
      {
        text: task.task,
        style: labelStyle,
        margin,
        width: `${labelWidth}%`,
        bold: true
      },
      {
        text: formattedAnswer,
        style: 'normal',
        margin,
        color: isEmptyAnswer ? '#999999' : '#000000',
        italics: isEmptyAnswer,
        width: `${100 - labelWidth}%`
      }
    ],
    // Add a light separator between items for better readability
    ...(depth > 0 ? {
      columnGap: 10,
      margin: [0, 0, 0, 5]
    } : {})
  }
}

/**
 * Get all child task IDs recursively for a given task
 */
function getAllChildTaskIds(taskId: string, flatTasks: Record<string, FlatTask>): string[] {
  const childIds: string[] = []
  const task = flatTasks[taskId]

  if (!task) return childIds

  // Add direct children
  childIds.push(...task.childrenIds)

  // Add children of children recursively
  task.childrenIds.forEach(childId => {
    childIds.push(...getAllChildTaskIds(childId, flatTasks))
  })

  return childIds
}


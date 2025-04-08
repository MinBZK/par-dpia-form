import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type Answer } from '@/stores/answers'
import { type FlatTask, type TaskInstance } from '@/stores/tasks'
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
 * Function for diagnosing instance rendering issues
 */
export function diagnosePdfIssues(
  rootTasks: any[],
  flatTasks: any,
  taskInstances: any,
  answers: any
): void {
  console.group('DPIA PDF Rendering Diagnosis');

  // Task instance statistics
  const totalInstances = Object.keys(taskInstances).length;
  const rootTaskIds = rootTasks.map(task => task.id);

  const instancesByTask = {};

  // Count instances per task
  Object.values(taskInstances).forEach((instance: any) => {
    if (!instancesByTask[instance.taskId]) {
      instancesByTask[instance.taskId] = [];
    }
    instancesByTask[instance.taskId].push(instance.id);
  });

  console.log('Total instances:', totalInstances);
  console.log('Root task IDs:', rootTaskIds);

  // Find repeatable tasks with multiple instances
  const repeatableTasks = Object.entries(instancesByTask)
    .filter(([_, instances]) => (instances as any[]).length > 1)
    .map(([taskId, instances]) => ({
      taskId,
      taskName: flatTasks[taskId]?.task || 'Unknown',
      instanceCount: (instances as any[]).length,
      instanceIds: instances,
      isDirectChildOfRoot: rootTaskIds.some(rootId =>
        Object.values(taskInstances)
          .some((instance: any) =>
            instance.taskId === rootId &&
            instance.childInstanceIds?.some(id => taskInstances[id]?.taskId === taskId)
          )
      )
    }));

  console.log('Repeatable tasks with multiple instances:', repeatableTasks);

  // Check parent-child relationships
  console.log('Checking parent-child relationships...');

  // Print out the first few instances of each repeatable task
  repeatableTasks.forEach(task => {
    console.group(`Task: ${task.taskName} (${task.taskId})`);

    const instanceIds = task.instanceIds as string[];
    const sampleSize = Math.min(instanceIds.length, 3);

    for (let i = 0; i < sampleSize; i++) {
      const instanceId = instanceIds[i];
      const instance = taskInstances[instanceId];

      console.log(`Instance ${i+1}/${sampleSize}:`, {
        id: instance.id,
        taskId: instance.taskId,
        parentInstanceId: instance.parentInstanceId,
        parentTask: instance.parentInstanceId ?
          `${flatTasks[taskInstances[instance.parentInstanceId]?.taskId]?.task} (${taskInstances[instance.parentInstanceId]?.taskId})` :
          'None',
        childCount: instance.childInstanceIds?.length || 0,
        groupId: instance.groupId,
        hasAnswer: !!answers[instance.id]
      });
    }

    console.groupEnd();
  });

  // Check if repeatable tasks are being found correctly in buildSectionContent
  const rootInstancesFound = rootTaskIds.map(taskId => {
    const directInstances = Object.values(taskInstances)
      .filter((instance: any) => instance.taskId === taskId);

    return {
      taskId,
      taskName: flatTasks[taskId]?.task || 'Unknown',
      directInstanceCount: directInstances.length,
      directInstances: directInstances.map((instance: any) => instance.id)
    };
  });

  console.log('Root task instances found:', rootInstancesFound);

  console.groupEnd();
}

/**
 * Comprehensive PDF export utility for DPIA application
 */

// Define types for better type safety
interface PdfExportOptions {
  includeEmptyFields?: boolean
  filename?: string
  language?: string
}

// Default export options
const DEFAULT_OPTIONS: PdfExportOptions = {
  includeEmptyFields: false,
  filename: 'DPIA_Export.pdf',
  language: 'nl-NL'
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

  // Get all task instances for this root task
  const instances = Object.values(taskInstances)
    .filter(instance => instance.taskId === task.id)

  // Process each instance
  instances.forEach(instance => {
    content.push(...renderTaskInstance(
      instance,
      flatTasks,
      taskInstances,
      answers,
      options,
      0
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

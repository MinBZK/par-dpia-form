import { type FlatTask } from '@/stores/tasks'
import { type Answer } from '@/stores/answers'
import { type TaskInstance } from '@/stores/tasks'

/**
 * Configuration options for the PDF table
 */
export interface PdfTableOptions {
  /** Column headers */
  headers?: string[]
  /** Column widths - can be numbers, 'auto', or '*' for equal width */
  columnWidths?: (number | string)[]
  /** Style for header cells */
  headerStyle?: any
  /** Style for body cells */
  bodyStyle?: any
  /** Table layout style ('lightHorizontalLines', 'headerLineOnly', etc) */
  tableLayout?: string
  /** Automatically center the table */
  centered?: boolean
  /** Margin around the table [left, top, right, bottom] */
  margin?: [number, number, number, number]
  /** Whether to include empty fields */
  includeEmptyFields?: boolean
  /** Text to show for empty fields */
  emptyFieldText?: string
}

/**
 * PdfTableBuilder - A class to build table definitions for pdfMake
 */
export class PdfTableBuilder {
  private headers: string[]
  private rows: any[][] = []
  private columnWidths: (number | string)[]
  private headerStyle: any
  private bodyStyle: any
  private tableLayout: string
  private centered: boolean
  private margin: [number, number, number, number]

  /**
   * Create a new PDF table builder
   * @param options Configuration options for the table
   */
  constructor(options: PdfTableOptions = {}) {
    this.headers = options.headers || []
    this.columnWidths = options.columnWidths || Array(this.headers.length).fill('*')
    this.headerStyle = options.headerStyle || {
      bold: true,
      fillColor: '#154273',
      color: '#ffffff',
      alignment: 'center',
      fontSize: 11
    }
    this.bodyStyle = options.bodyStyle || { fontSize: 10 }
    this.tableLayout = options.tableLayout || 'headerLineOnly'
    this.centered = options.centered || false
    this.margin = options.margin || [0, 10, 0, 15]
  }

  /**
   * Set the headers for the table
   * @param headers Array of header strings
   */
  setHeaders(headers: string[]): this {
    this.headers = headers
    this.columnWidths = Array(headers.length).fill('*')
    return this
  }

  /**
   * Set the column widths
   * @param widths Array of column widths
   */
  setColumnWidths(widths: (number | string)[]): this {
    if (widths.length !== this.headers.length) {
      console.warn(`Column widths length (${widths.length}) doesn't match header length (${this.headers.length})`)
    }
    this.columnWidths = widths
    return this
  }

  /**
   * Add a row to the table
   * @param rowData Array of cell values for the row
   */
  addRow(rowData: any[]): this {
    // Ensure row length matches header length
    if (rowData.length !== this.headers.length) {
      console.warn(`Row data length (${rowData.length}) doesn't match header length (${this.headers.length})`)
      // Pad or truncate as needed
      if (rowData.length < this.headers.length) {
        rowData = [...rowData, ...Array(this.headers.length - rowData.length).fill('')]
      } else {
        rowData = rowData.slice(0, this.headers.length)
      }
    }
    this.rows.push(rowData)
    return this // Enable method chaining
  }

  /**
   * Add multiple rows at once
   * @param rows Array of row data arrays
   */
  addRows(rows: any[][]): this {
    rows.forEach(row => this.addRow(row))
    return this
  }

  /**
   * Generate pdfMake table definition
   */
  build(): any {
    if (this.headers.length === 0) {
      console.warn('Attempting to build table with no headers')
      return {}
    }

    if (this.rows.length === 0) {
      console.warn('Attempting to build table with no rows')
      return {}
    }

    const headerRow = this.headers.map(header => ({
      text: header,
      ...this.headerStyle
    }))

    const bodyRows = this.rows.map(row =>
      row.map(cell => ({
        text: cell === null || cell === undefined ? '' : String(cell),
        ...this.bodyStyle
      }))
    )

    const tableDefinition = {
      table: {
        headerRows: 1,
        widths: this.columnWidths,
        body: [headerRow, ...bodyRows]
      },
      layout: this.tableLayout,
      margin: this.margin
    }

    if (this.centered) {
      return {
        alignment: 'center',
        ...tableDefinition
      }
    }

    return tableDefinition
  }
}

/**
 * Helper function to format answer values based on field type
 */
function formatAnswerValue(
  answer: any,
  fieldTask: FlatTask
): string {
  if (answer === undefined || answer === null) {
    return ''
  }

  if (fieldTask.type?.includes('select_option') && fieldTask.options) {
    // For select options, show the label if available
    const option = fieldTask.options.find(opt => String(opt.value) === String(answer))
    return option ? String(option.label || option.value) : String(answer)
  }

  if (fieldTask.type?.includes('radio_option') && fieldTask.options) {
    // For radio options, show the label if available
    const option = fieldTask.options.find(opt => String(opt.value) === String(answer))
    return option ? String(option.label || option.value) : String(answer)
  }

  if (fieldTask.type?.includes('checkbox_option') && Array.isArray(answer)) {
    // For checkbox options, join selected values
    return answer.join(', ')
  }

  if (fieldTask.type?.includes('date') && answer) {
    // Format dates
    try {
      const dateObj = new Date(answer)
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('nl-NL')
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // Default handling
  return String(answer)
}

/**
 * Generates a table for any repeatable task group by automatically mapping child tasks to columns
 *
 * @param taskGroupId The ID of the repeatable task group
 * @param flatTasks Map of all tasks
 * @param taskInstances Map of all task instances
 * @param answers Map of all answers
 * @param options Table display options
 * @returns PDFMake table definition or null if insufficient data
 */
export function generateTableForTaskGroup(
  taskGroupId: string,
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>,
  answers: Record<string, Answer>,
  options: PdfTableOptions = {}
): any {
  // Get the task group
  const taskGroup = flatTasks[taskGroupId]
  if (!taskGroup) {
    console.warn(`Task group with ID ${taskGroupId} not found`)
    return null
  }

  // Check if it has child tasks to use as columns
  if (!taskGroup.childrenIds || taskGroup.childrenIds.length === 0) {
    console.warn(`Task group ${taskGroupId} has no child tasks to use as columns`)
    return null
  }

  // Get instances of this task group
  const taskGroupInstances = Object.values(taskInstances)
    .filter(instance => instance.taskId === taskGroupId)

  if (taskGroupInstances.length === 0) {
    console.warn(`No instances found for task group ${taskGroupId}`)
    return null
  }

  // Get column definitions from child tasks
  const childTaskIds = taskGroup.childrenIds
  const columns = childTaskIds
    .map(childId => flatTasks[childId])
    .filter(childTask =>
      // Only include appropriate task types for columns
      childTask && childTask.type && childTask.type.some(type =>
        ['text_input', 'open_text', 'select_option', 'radio_option', 'checkbox_option', 'date'].includes(type)
      )
    )

  if (columns.length === 0) {
    console.warn(`No suitable child tasks found for columns in task group ${taskGroupId}`)
    return null
  }

  // Create headers from column task names
  const headers = columns.map(column => column.task)

  // Create table builder
  const tableBuilder = new PdfTableBuilder({
    headers,
    ...options
  })

  // Process each instance into a row
  taskGroupInstances.forEach(instance => {
    const row: any[] = []

    // For each column/child task
    columns.forEach(column => {
      // Find the instance of this child for the current task group instance
      const childInstances = Object.values(taskInstances)
        .filter(inst => inst.taskId === column.id && inst.parentInstanceId === instance.id)

      let cellValue = ''

      if (childInstances.length > 0) {
        const childInstance = childInstances[0]
        const answer = answers[childInstance.id]?.value

        // Format the answer based on field type
        cellValue = formatAnswerValue(answer, column)
      }

      row.push(cellValue)
    })

    tableBuilder.addRow(row)
  })

  return tableBuilder.build()
}

/**
 * Helper function to check if a task should be rendered as a table
 * (i.e., it's a repeatable task group with form field children)
 */
export function shouldRenderAsTable(
  taskId: string,
  flatTasks: Record<string, FlatTask>,
  taskInstances: Record<string, TaskInstance>
): boolean {
  const task = flatTasks[taskId]

  // Must be a task group
  if (!task || !task.type?.includes('task_group')) {
    return false
  }

  // Must be repeatable or have multiple instances
  if (!task.repeatable) {
    const instances = Object.values(taskInstances)
      .filter(instance => instance.taskId === taskId)

    if (instances.length <= 1) {
      return false
    }
  }

  // Must have child tasks that can be columns
  const hasFormFieldChildren = task.childrenIds?.some(childId => {
    const childTask = flatTasks[childId]
    return childTask && childTask.type?.some(type =>
      ['text_input', 'open_text', 'select_option', 'radio_option', 'checkbox_option', 'date'].includes(type)
    )
  })

  if (!hasFormFieldChildren) {
    return false
  }

  // Must have instances
  const hasInstances = Object.values(taskInstances)
    .some(instance => instance.taskId === taskId)

  return hasInstances
}

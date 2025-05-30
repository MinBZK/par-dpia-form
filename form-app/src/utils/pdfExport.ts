import { type FlatTask, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import { FormType } from '@/models/dpia.ts'
import * as pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import type { StyleDictionary, TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import FontService from '@/services/fontService.ts'
import { renderInstanceLabel } from '@/utils/taskUtils'
import { getPlainTextWithoutDefinitions } from '@/utils/stripHtml'
import { hasInstanceMapping, shouldShowTask } from '@/utils/dependency'
import { generateFilename } from './fileName'
import type { CalculationStoreType } from '@/stores/calculations'



// Initialize PDFMake
(<any>pdfMake).addVirtualFileSystem(pdfFonts)

const dutchDateFormatter = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

export async function exportToPdf(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  calculationStore: CalculationStoreType,
  filename?: string,
): Promise<void> {
  const activeNamespace = taskStore.activeNamespace
  const formType = activeNamespace === FormType.DPIA ? 'DPIA' : 'Pre-scan DPIA'

  let rootTasks = taskStore.rootTaskIds[activeNamespace]
    .map(id => taskStore.flatTasks[activeNamespace][id])
    .filter(task => !task.type.includes('signing'))

  // Find the management summary task (ID "19")
  const managementSummaryTask = rootTasks.find(task => task.id === "19")

  // Filter out the management summary from regular tasks if it exists
  if (managementSummaryTask) {
    rootTasks = rootTasks.filter(task => task.id !== "19")
  }

  // Ordered content array for PDF
  const contentSections: Content[] = activeNamespace === FormType.DPIA
    ? buildDpiaContentSections(taskStore, answerStore)
    : buildPreScanContentSections(taskStore, answerStore, calculationStore)


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
      defaultStyle: {
        font: 'rijksoverheidsanstext' // Use Roboto as the default font since it's included with pdfMake by default
      },
      content: [
        // Cover page
        {
          stack: [
            { text: formType, style: 'title' },
            {
              text: `Gegenereerd met de 'DPIA Rapportagemodel Editor' op ${dutchDateFormatter.format(new Date())}`,
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
        ...contentSections,
      ],

      // Page numbers
      footer: function(currentPage, pageCount) {
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
        title: `${formType} Rapportagemodel`,
        author: `Invulhulp DPIA`,
        creator: `Invulhulp DPIA`,
      },

      // Page styling
      pageSize: 'A4',
      pageMargins: [70, 70, 70, 70],
      styles: dpiaStyleDictionary,
    }

    // Start with default Roboto font
    const fontDefinitions: Record<string, Record<string, string>> = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
      }
    }

    const customFonts = await FontService.getFonts()

    // Add all font families from the FontService
    for (const [fontFamily, variants] of Object.entries(customFonts)) {
      fontDefinitions[fontFamily] = variants as Record<string, string>
    }

    const actualFilename = filename || generateFilename(activeNamespace, 'pdf')

    const vfs = await FontService.getVFS()

    pdfMake.createPdf(docDefinition, undefined, fontDefinitions, vfs).download(actualFilename)

    return Promise.resolve()
  } catch (error) {
    return Promise.reject(new Error(`Failed to export PDF: ${error}`))
  }
}

function buildDpiaContentSections(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType
): Content[] {
  const rootTasks = taskStore.getRootTasks
  const contentSections: Content[] = []

  // Find special tasks by ID
  const metadataTask = rootTasks.find(task => task.id === "19") // Version, Status, DPIA-dossier, etc.
  const signingTask = rootTasks.find(task => task.id === "20") // Signing
  const managementSummaryTask = rootTasks.find(task => task.id === "18") // Management summary

  // Get official tasks (numbered sections)
  const officialTasks = rootTasks.filter(task =>
    task.is_official_id &&
    !task.type.includes('signing')
  )

  // 1. Add "Versie, Status, DPIA-dossier..." section (19)
  if (metadataTask) {
    contentSections.push(buildUnNumberedSection(metadataTask, taskStore, answerStore))
  }

  // 2. Add "Vaststelling en ondertekening" section (20)
  if (signingTask) {
    contentSections.push(buildUnNumberedSection(signingTask, taskStore, answerStore))
  }

  // 3. Add "Managementsamenvatting" section (18)
  if (managementSummaryTask) {
    contentSections.push(buildUnNumberedSection(managementSummaryTask, taskStore, answerStore))
  }

  // 4. Add numbered sections (1-17)
  let sectionNumber = 1
  for (const task of officialTasks) {
    contentSections.push(buildNumberedSection(task, taskStore, answerStore, sectionNumber))
    sectionNumber++
  }

  return contentSections
}

function buildPreScanContentSections(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  calculationStore: CalculationStoreType
): Content[] {
  // Get non-signing root tasks
  const rootTasks = taskStore.getRootTasks.filter(task => !task.type.includes('signing'))
  const contentSections: Content[] = []

  // 1. Add results section first
  contentSections.push(buildResultsSection(calculationStore, 1))

  // 2. Add all other sections with incremented section numbers
  let sectionNumber = 2
  for (const task of rootTasks) {
    contentSections.push(buildNumberedSection(task, taskStore, answerStore, sectionNumber))
    sectionNumber++
  }

  return contentSections
}

// Special function to build the results section for Pre-scan
function buildResultsSection(
  calculationStore: CalculationStoreType,
  sectionNumber: number,
): Content {
  const contentElements: Content[] = []

  // Add title with section number
  contentElements.push({
    text: `${sectionNumber}.  Resultaten`,
    style: 'header',
    tocItem: true,
  })

  // Add description
  contentElements.push({
    text: 'Op basis van uw antwoorden zijn de volgende assessments vereist of aanbevolen:',
    style: 'description',
  })

  // Get required or recommended assessments
  const relevantAssessments = calculationStore.assessmentResults.filter(
    assessment => assessment.required || assessment.level === 'recommended'
  )

  if (relevantAssessments.length === 0) {
    contentElements.push({
      text: "Op basis van de huidige antwoorden zijn er geen assessments vereist of aanbevolen.",
      style: 'normal',
    })
  } else {
    // For each relevant assessment, add a section
    for (const assessment of relevantAssessments) {
      contentElements.push({
        text: assessment.id,
        style: 'subHeader',
        margin: [0, 15, 0, 5],
      })

      // Format multiline explanation by replacing newlines with proper paragraphs
      const explanationLines = assessment.explanation.split('\n').filter(line => line.trim() !== '');

      for (const line of explanationLines) {
        contentElements.push({
          text: line,
          style: 'normal',
          margin: [0, 0, 0, 10],
        })
      }
    }
  }

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

// Special function to build the management summary section
function buildUnNumberedSection(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Content {
  const contentElements: Content[] = []

  contentElements.push({
    text: `${getPlainTextWithoutDefinitions(task.task)}`,
    style: 'header',
    tocItem: true,
  })

  // Add description if available
  if (task.description) {
    contentElements.push(buildSectionDesciption(task.description))
  }

  // Add content
  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

// Build a regular section with a custom section number
function buildNumberedSection(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  sectionNumber: number,
): Content {
  const contentElements: Content[] = []

  // Add title with custom section number
  contentElements.push({
    text: `${sectionNumber}.  ${getPlainTextWithoutDefinitions(task.task)}`,
    style: 'header',
    tocItem: true,
  })

  if (task.description) {
    contentElements.push(buildSectionDesciption(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

function buildSectionDesciption(description?: string): Content {
  return {
    stack: [
      { text: 'Beschrijving', style: 'subSubHeader' },
      { text: `${getPlainTextWithoutDefinitions(description)}`, style: 'description' },
    ],
  }
}

/**
 * Formats answer values for display in the PDF
 */
function formatAnswerValue(value: any): string {
  if (value === null || value === undefined) {
    return 'Vraag is niet ingevuld of er is geen waarde geselecteerd.'
  }

  if (Array.isArray(value)) {
    const cleanItems = value
      .map(item => {
        if (item === null || item === undefined) return '';
        return getPlainTextWithoutDefinitions(String(item));
      })
      .filter(item => item.trim() !== '');
    return cleanItems.join(', ');
  }
  else if (value === 'true') {
    return 'Ja'
  } else if (value === 'false') {
    return 'Nee'
  } else if (value === 'null') {
    return ''
  }
  return value ? getPlainTextWithoutDefinitions(String(value)) : ''
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
      childElements.push({ text: getPlainTextWithoutDefinitions(childTask.task), style: 'subSubHeader' })

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
      text: getPlainTextWithoutDefinitions(task.task),
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
    if (tableRows.length > 0) {
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
  return Object.values(taskStore.taskInstances[taskStore.activeNamespace])
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

  // Only add header row if there's an instance label template
  if (task.instance_label_template) {
    const instanceLabel = renderInstanceLabel(instanceId, task.instance_label_template)

    tableRows.push([
      {
        text: getPlainTextWithoutDefinitions(instanceLabel),
        style: 'tableHeader',
        colSpan: 2,
        margin: [0, 3, 0, 3],
      },
      {},
    ])
  }

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
          text: getPlainTextWithoutDefinitions(childTask.task),
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
  // Skip only if completely empty
  if (rows.length === 0) {
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

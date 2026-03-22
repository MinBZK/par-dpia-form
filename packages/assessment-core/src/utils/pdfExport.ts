import { type FlatTask, type TaskStoreType } from '../stores/tasks'
import { type AnswerStoreType, isImageValue, type ImageValue } from '../stores/answers'
import { convertWebpToPng } from './imageResize'
import { type CalculationStoreType } from '../stores/calculations'
import { FormType } from '../models/dpia'
import { getPlainTextWithoutDefinitions } from './stripHtml'
import { hasInstanceMapping, shouldShowTask } from './dependency'
import { renderInstanceLabel } from './taskUtils'
import { generateFilename } from './fileName'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { StyleDictionary, TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import FontService from '../services/fontService'

// @ts-expect-error pdfmake 0.3.x types not yet in @types/pdfmake
pdfMake.addVirtualFileSystem(pdfFonts)

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

  // Pre-convert WebP images to PNG (pdfmake only supports JPEG/PNG)
  pdfImageCache.clear()
  await preConvertImages(answerStore, activeNamespace)

  const contentSections: Content[] = activeNamespace === FormType.DPIA
    ? buildDpiaContentSections(taskStore, answerStore)
    : buildPreScanContentSections(taskStore, answerStore, calculationStore)

  const styles: StyleDictionary = {
    title: {
      fontSize: 28,
      bold: true,
      margin: [0, 0, 0, 10],
      color: '#154273',
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
      color: '#154273',
    },
    subHeader: {
      fontSize: 16,
      bold: true,
      margin: [0, 15, 0, 10],
      color: '#154273',
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
        font: 'rijksoverheidsanstext'
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

      footer: function(currentPage, pageCount) {
        return {
          text: `Pagina ${currentPage} van ${pageCount}`,
          alignment: 'center',
          margin: [0, 0, 40, 0],
          color: '#999999',
          fontSize: 10,
        }
      },

      info: {
        title: `${formType} Rapportagemodel`,
        author: `Invulhulp DPIA`,
        creator: `Invulhulp DPIA`,
      },

      pageSize: 'A4',
      pageMargins: [70, 70, 70, 70],
      styles,
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

    // pdfmake 0.3: register fonts and VFS on the instance before creating PDF
    // @ts-expect-error pdfmake 0.3.x types not yet in @types/pdfmake
    pdfMake.addFonts(fontDefinitions)
    // @ts-expect-error pdfmake 0.3.x types not yet in @types/pdfmake
    pdfMake.addVirtualFileSystem(vfs)
    pdfMake.createPdf(docDefinition).download(actualFilename)

    return Promise.resolve()
  } catch (error) {
    return Promise.reject(new Error(`Failed to export PDF: ${error}`))
  } finally {
    pdfImageCache.clear()
  }
}

function buildDpiaContentSections(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType
): Content[] {
  const rootTasks = taskStore.getRootTasks
  const contentSections: Content[] = []

  const metadataTask = rootTasks.find(task => task.id === "19")
  const signingTask = rootTasks.find(task => task.id === "20")
  const managementSummaryTask = rootTasks.find(task => task.id === "18")

  const officialTasks = rootTasks.filter(task =>
    task.is_official_id &&
    !task.type.includes('signing')
  )

  if (metadataTask) {
    contentSections.push(buildUnNumberedSection(metadataTask, taskStore, answerStore))
  }

  if (signingTask) {
    contentSections.push(buildUnNumberedSection(signingTask, taskStore, answerStore))
  }

  if (managementSummaryTask) {
    contentSections.push(buildUnNumberedSection(managementSummaryTask, taskStore, answerStore))
  }

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
  const rootTasks = taskStore.getRootTasks.filter(task => !task.type.includes('signing'))
  const contentSections: Content[] = []

  contentSections.push(buildResultsSection(calculationStore, 1))

  let sectionNumber = 2
  for (const task of rootTasks) {
    contentSections.push(buildNumberedSection(task, taskStore, answerStore, sectionNumber))
    sectionNumber++
  }

  return contentSections
}

function buildResultsSection(
  calculationStore: CalculationStoreType,
  sectionNumber: number,
): Content {
  const contentElements: Content[] = []

  contentElements.push({
    text: `${sectionNumber}.  Resultaten`,
    style: 'header',
    tocItem: true,
  })

  contentElements.push({
    text: 'Op basis van uw antwoorden zijn de volgende assessments vereist of aanbevolen:',
    style: 'description',
  })

  const relevantAssessments = calculationStore.assessmentResults.filter(
    assessment => assessment.required || assessment.level === 'recommended'
  )

  if (relevantAssessments.length === 0) {
    contentElements.push({
      text: "Op basis van de huidige antwoorden zijn er geen assessments vereist of aanbevolen.",
      style: 'normal',
    })
  } else {
    for (const assessment of relevantAssessments) {
      contentElements.push({
        text: assessment.id,
        style: 'subHeader',
        margin: [0, 15, 0, 5],
      })

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

  if (task.description) {
    contentElements.push(buildSectionDescription(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

function buildNumberedSection(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  sectionNumber: number,
): Content {
  const contentElements: Content[] = []

  contentElements.push({
    text: `${sectionNumber}.  ${getPlainTextWithoutDefinitions(task.task)}`,
    style: 'header',
    tocItem: true,
  })

  if (task.description) {
    contentElements.push(buildSectionDescription(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    stack: contentElements,
    pageBreak: 'before',
  }
}

function buildSectionDescription(description?: string): Content {
  return {
    stack: [
      { text: 'Beschrijving', style: 'subSubHeader' },
      { text: `${getPlainTextWithoutDefinitions(description)}`, style: 'description' },
    ],
  }
}

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

// A4 (595pt) minus page margins (70+70) = 455pt usable content width
const CONTENT_WIDTH = 455

// Cache for WebP→PNG converted images (populated before content building)
const pdfImageCache = new Map<string, string>()

async function preConvertImages(answerStore: AnswerStoreType, namespace: FormType) {
  const answers = answerStore.answers[namespace] || {}
  const conversions: Promise<void>[] = []

  for (const answer of Object.values(answers)) {
    if (isImageValue(answer.value) && answer.value.data.startsWith('data:image/webp')) {
      const webpData = answer.value.data
      conversions.push(
        convertWebpToPng(webpData).then(png => { pdfImageCache.set(webpData, png) }),
      )
    }
  }

  await Promise.all(conversions)
}

function getPdfImageData(dataUri: string): string {
  return pdfImageCache.get(dataUri) ?? dataUri
}

function buildImageContent(img: ImageValue): Content {
  const elements: Content[] = []
  if (img.title) {
    elements.push({ text: img.title, bold: true, margin: [0, 5, 0, 3] })
  }
  elements.push({ image: getPdfImageData(img.data), fit: [CONTENT_WIDTH, 700], margin: [0, 3, 0, 3] })
  if (img.description) {
    elements.push({ text: img.description, italics: true, margin: [0, 3, 0, 3] })
  }
  if (img.source) {
    elements.push({ text: `Bron: ${img.source}`, italics: true, fontSize: 8, margin: [0, 0, 0, 5] })
  }
  return { stack: elements }
}

function buildAnswer(
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Content {
  if (task.type?.includes('task_group') && task.childrenIds?.length > 0) {
    const childElements: Content[] = []

    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)
      childElements.push({ text: getPlainTextWithoutDefinitions(childTask.task), style: 'subSubHeader' })

      const contentItems = processTaskWithInstances(childTask, null, taskStore, answerStore, 0)
      if (contentItems.length > 0) {
        childElements.push(...contentItems)
      }
    }

    return { stack: childElements }
  }
  else {
    const instanceId = taskStore.getRootTaskInstanceIds(task.id)[0]
    const answer = answerStore.getAnswer(instanceId)
    if (isImageValue(answer)) return buildImageContent(answer)
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

  let instanceIds: string[] = []

  if (parentInstanceId && hasInstanceMapping(task)) {
    instanceIds = findMappedInstances(task.id, parentInstanceId, taskStore)
  } else {
    instanceIds = parentInstanceId
      ? taskStore.getInstanceIdsForTask(task.id, parentInstanceId)
      : taskStore.getInstanceIdsForTask(task.id)
  }

  if (instanceIds.length === 0) {
    return elements
  }

  if (!task.childrenIds || task.childrenIds.length === 0) {
    for (const instanceId of instanceIds) {
      if (shouldShowTask(task.id, instanceId, taskStore, answerStore)) {
        const answer = answerStore.getAnswer(instanceId)
        if (isImageValue(answer)) {
          elements.push(buildImageContent(answer))
        } else {
          elements.push({
            text: formatAnswerValue(answer),
            style: 'normal',
            margin: [nestingLevel * 10, 0, 0, 5],
          })
        }
      }
    }
    return elements
  }

  if (nestingLevel > 0 && instanceIds.length > 0 && task.repeatable) {
    elements.push({
      text: getPlainTextWithoutDefinitions(task.task),
      style: 'category',
      margin: [nestingLevel * 10, 10, 0, 5],
    })
  }

  for (const instanceId of instanceIds) {
    if (!shouldShowTask(task.id, instanceId, taskStore, answerStore)) {
      continue
    }

    const { tableRows, imageBlocks } = buildTableRows(instanceId, task, taskStore, answerStore)
    if (tableRows.length > 0) {
      elements.push(createTableElement(tableRows, ['35%', '65%'], nestingLevel * 10))
    }
    if (imageBlocks.length > 0) {
      elements.push(...imageBlocks)
    }

    for (const childId of task.childrenIds) {
      const childTask = taskStore.taskById(childId)

      if (!childTask.childrenIds || childTask.childrenIds.length === 0) {
        continue
      }

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

function buildTableRows(
  instanceId: string,
  task: FlatTask,
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): { tableRows: any[][]; imageBlocks: Content[] } {
  const tableRows: any[][] = []
  const imageBlocks: Content[] = []

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

  for (const childId of task.childrenIds) {
    const childTask = taskStore.taskById(childId)

    if (childTask.childrenIds && childTask.childrenIds.length > 0) {
      continue
    }

    const childInstanceIds = taskStore.getInstanceIdsForTask(childId, instanceId)

    for (const childInstanceId of childInstanceIds) {
      if (!shouldShowTask(childId, childInstanceId, taskStore, answerStore)) {
        continue
      }

      const value = answerStore.getAnswer(childInstanceId)
      if (isImageValue(value)) {
        imageBlocks.push(buildImageContent(value))
        continue
      }
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

  return { tableRows, imageBlocks }
}

function createTableElement(
  rows: any[][],
  widths: any[] = ['35%', '65%'],
  leftMargin: number = 0,
): Content {
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

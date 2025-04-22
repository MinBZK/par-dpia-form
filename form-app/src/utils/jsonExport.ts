import { type DPIASnapshot } from '@/models/dpiaSnapshot'
<<<<<<< HEAD:form-app/src/utils/fileExport.ts
import { type FlatTask, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import * as pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import type { StyleDictionary, TDocumentDefinitions, Content } from 'pdfmake/interfaces';


(<any>pdfMake).addVirtualFileSystem(pdfFonts);
=======
import { type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import { generateFilename } from './fileName'
>>>>>>> main:form-app/src/utils/jsonExport.ts

export async function importFromJson(file: File): Promise<DPIASnapshot> {
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

<<<<<<< HEAD:form-app/src/utils/fileExport.ts
const dpiaStyleDictionary: StyleDictionary = {
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
  subsubtitle: {
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
  subHeader: {
    fontSize: 18,
    bold: true,
    margin: [0, 15, 0, 10],
    color: '#154273' // RVO blue
  },
  subSubHeader: {
    fontSize: 16,
    bold: true,
    margin: [0, 10, 0, 5]
  },
  normal: {
    fontSize: 11,
  }
}

export async function exportDpiaToPdf(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Promise<void> {
  const docDefinition: TDocumentDefinitions = {
    content: [
      // Cover page
      {
        stack: [
          { text: 'Data Protection Impact Assessment', style: 'title' },
          { text: 'DPIA Rapportagemodel', style: 'subtitle' },
          { text: `Gegenereerd met de 'DPIA Rapportagemodel Editor' op ${new Date().toISOString()}`, style: 'subsubtitle' },
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
      ...taskStore.getRootTasks.filter(task => !task.type.includes("signing")).map(task => buildSection(task, taskStore, answerStore)),
    ],


    // Page numbers
    footer: function(currentPage, pageCount) {
      return {
        text: `Pagina ${currentPage} van ${pageCount}`,
        alignment: 'center',
        margin: [0, 0, 40, 0],
        color: '#999999',
        fontSize: 10
      }
    },

    // Document metadata
    info: {
      title: 'DPIA Rapportagemodel',
      author: 'DPIA Rapportagemodel Editor',
      creator: 'DPIA Rapportagemodel Editor'
    },

    // Page styling
    pageSize: 'A4',
    pageMargins: [70, 70, 70, 70],
    styles: dpiaStyleDictionary,
  }

  pdfMake.createPdf(docDefinition).download('DPIA_Rapportagemodel.pdf')
}

function buildSection(task: FlatTask, taskStore: TaskStoreType, answerStore: AnswerStoreType): Content {
  const contentElements: Content = [
    buildSectionTitle(task.id, task.task),
  ]

  if (task.description) {
    contentElements.push(buildSectionDesciption(task.description))
  }

  contentElements.push(buildAnswer(task, taskStore, answerStore))

  return {
    text: contentElements,
    pageBreak: 'before'
  }
}

function buildSectionTitle(taskId: string, taskName: string): Content {
  return {
    text: [
      { text: `${taskId}.  ${taskName}`, style: 'header', tocItem: true },
      { text: "\n\n", style: 'normal' },
    ]
  }
}

function buildSectionDesciption(description?: string): Content {
  return {
    text: [
      { text: "Beschrijving", style: 'subSubHeader' },
      { text: "\n", style: 'normal' },
      { text: `${description}`, style: 'normal' },
      { text: "\n\n", style: 'normal' },
    ]
  }
}

function buildAnswer(task: FlatTask, taskStore: TaskStoreType, answerStore: AnswerStoreType): Content {
  const answerContent: Content = [
    { text: "Antwoord", style: 'subSubHeader' },
    { text: "\n", style: 'normal' },
  ]
  var singleTaskAnswer
  if (!task.type?.includes("task_group") || !task.childrenIds?.length) {
    const instanceId = taskStore.getRootTaskInstanceIds(task.id)[0]
    singleTaskAnswer = answerStore.getAnswer(instanceId)

    if (singleTaskAnswer !== null) {
      answerContent.push({ text: `${singleTaskAnswer}`, style: 'normal' })
    } else {
      answerContent.push({ text: 'Vraag niet beantwoord', style: 'normal' })
    }

  }
  return { text: answerContent }
=======
export async function exportToJson(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  filename?: string,
): Promise<void> {
  try {
    // Create snapshot data
    const snapshotData: DPIASnapshot = {
      metadata: {
        savedAt: new Date().toISOString(),
      },
      taskState: {
        currentRootTaskId: taskStore.currentRootTaskId,
        taskInstances: taskStore.taskInstances,
        completedRootTaskIds: Array.from(taskStore.completedRootTaskIds),
      },
      answers: answerStore.answers,
    }

    // Use provided filename or generate default
    const actualFilename = filename || generateFilename('json')

    // Download the file
    await downloadJsonFile(snapshotData, actualFilename)

    return Promise.resolve()
  } catch (error) {
    console.error('Failed to export JSON:', error)
    return Promise.reject(new Error('Failed to export to JSON'))
  }
}

export function downloadJsonFile(data: unknown, filename: string): Promise<void> {
  try {
    const jsonString = JSON.stringify(data, null, 4)
    const blob = new Blob([jsonString], { type: 'application/json' })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename

    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return Promise.resolve()
  } catch (error) {
    console.error('Error in creating download file:', error)
    return Promise.reject(new Error('Failed to create download file'))
  }
>>>>>>> main:form-app/src/utils/jsonExport.ts
}

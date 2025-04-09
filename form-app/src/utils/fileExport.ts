import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type FlatTask, type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
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

export async function exportDpiaToPdf(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): Promise<void> {
  var docDefinition = {
    pageSize: 'A4',
    pageMargins: [70, 70, 70, 70],

    content: [
      // Cover page
      {
        stack: [
          { text: 'Data Protection Impact Assessment', style: 'title' },
          { text: 'DPIA Rapportagemodel', style: 'subtitle' },
          { text: `Gegenereerd met de 'DPIA Rapportage-editor' op ${new Date().toISOString()}`, style: 'subsubtitle' },
        ],
        alignment: 'center',
        margin: [0, 150, 0, 0],
        pageBreak: 'after',
      },
      {
        toc: {
          title: { text: 'Inhoudsopgave', style: 'header' },
        },
      },
      ...taskStore.getRootTasks.filter(task => !task.type.includes("signing")).map(task => buildSection(task)),
    ],
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
      }
    }
  }

  pdfMake.createPdf(docDefinition).download('DPIA_Rapportagemodel.pdf')
}

function buildSection(task: FlatTask): any {
  const content = { text: `${task.id}.  ${task.task}`, style: 'header', tocItem: true, pageBreak: 'before' }
  return content
}

import { type DPIASnapshot } from '@/models/dpiaSnapshot'
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

export async function exportDpiaToPdf(): Promise<void> {
}

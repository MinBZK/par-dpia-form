import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { type TaskStoreType } from '@/stores/tasks'
import { type AnswerStoreType } from '@/stores/answers'
import { generateFilename } from './fileName'

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


export async function exportToJson(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  filename?: string
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

    return Promise.resolve()
  } catch (error) {
    console.error('Error in creating download file:', error)
    return Promise.reject(new Error('Failed to create download file'))
  }
}



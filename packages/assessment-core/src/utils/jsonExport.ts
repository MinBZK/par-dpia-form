import { type AssessmentState, type AssessmentOutput, OUTPUT_SCHEMA_URL } from '../models/assessmentState'
import { type TaskStoreType } from '../stores/tasks'
import { type AnswerStoreType } from '../stores/answers'
import { FormType } from '../models/dpia'
import { generateFilename } from './fileName'
import { useSchemaStore } from '../stores/schemas'
import { migrateStateV1toV2 } from './stateMigration'

export async function importFromJson(file: File, activeNamespace: FormType): Promise<AssessmentState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target || typeof event.target.result !== 'string') {
          reject(new Error('Could not read given file'))
          return
        }

        const data = JSON.parse(event.target.result) as AssessmentState

        if (!data.metadata || !data.answers) {
          reject(new Error('File contains format incompatible with AssessmentState structure'))
          return
        }

        const hasDPIA = data.answers[FormType.DPIA];
        const hasPreScan = data.answers[FormType.PRE_SCAN];

        if (!hasDPIA && !hasPreScan) {
          reject(new Error('The uploaded file does not contain valid DPIA or Pre-scan DPIA data.'))
          return
        }

        const schemaStore = useSchemaStore()
        const urnLookup: Record<string, string> = {}
        if (hasDPIA) urnLookup[FormType.DPIA] = schemaStore.getUrn(FormType.DPIA)
        if (hasPreScan) urnLookup[FormType.PRE_SCAN] = schemaStore.getUrn(FormType.PRE_SCAN)

        resolve(migrateStateV1toV2(data, urnLookup))
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
  filename?: string,
): Promise<void> {
  try {
    // Create output data
    const activeNamespace = taskStore.activeNamespace
    const schemaStore = useSchemaStore()

    const outputData: AssessmentOutput = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: {
        createdAt: new Date().toISOString(),
        urn: schemaStore.getUrn(activeNamespace),
      },
      answers: answerStore.answers[activeNamespace] || {},
    }

    // Use provided filename or generate default
    const actualFilename = filename || generateFilename(activeNamespace, 'json')

    // Download the file
    await downloadJsonFile(outputData, actualFilename)

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
}

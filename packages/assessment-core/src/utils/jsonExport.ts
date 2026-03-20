import { type AssessmentState, type AssessmentOutput, OUTPUT_SCHEMA_URL } from '../models/assessmentState'
import type { TaskStoreType } from '../stores/tasks'
import type { AnswerStoreType } from '../stores/answers'
import { FormType } from '../models/dpia'
import { generateFilename } from './fileName'
import { useSchemaStore } from '../stores/schemas'
import { parseAndValidateImport } from './importDetect'

export async function importFromJson(file: File): Promise<AssessmentState> {
  const text = await file.text()
  const data = parseAndValidateImport(text)

  const schemaStore = useSchemaStore()
  const ns = data.metadata.activeNamespace
  if (ns && !data.metadata.urn) {
    data.metadata.urn = schemaStore.getUrn(ns as FormType)
  }

  return data
}

export function buildOutputData(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): AssessmentOutput {
  const activeNamespace = taskStore.activeNamespace
  const schemaStore = useSchemaStore()

  const completedTasks = Array.from(taskStore.completedRootTaskIds[activeNamespace]).sort((a, b) => parseInt(a) - parseInt(b))

  return {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      createdAt: new Date().toISOString(),
      urn: schemaStore.getUrn(activeNamespace),
      ...(completedTasks.length > 0 && { completedTasks }),
    },
    answers: answerStore.answers[activeNamespace] || {},
  }
}

export function exportToJson(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
  filename?: string,
): void {
  const outputData = buildOutputData(taskStore, answerStore)
  const actualFilename = filename || generateFilename(taskStore.activeNamespace, 'json')
  downloadJsonFile(outputData, actualFilename)
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const jsonString = JSON.stringify(data, null, 4)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

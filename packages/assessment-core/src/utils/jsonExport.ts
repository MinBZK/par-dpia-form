import { type AssessmentState, OUTPUT_SCHEMA_URL } from '../models/assessmentState'
import type { TaskStoreType } from '../stores/tasks'
import type { AnswerStoreType } from '../stores/answers'
import { generateFilename } from './fileName'
import { useSchemaStore } from '../stores/schemas'
import { parseAndValidateImport } from './importDetect'
import { groupAnswers } from './groupedAnswers'
import { filterVisibleAnswers } from './impactedAnswers'

export async function importFromJson(file: File): Promise<AssessmentState> {
  const text = await file.text()
  return parseAndValidateImport(text)
}

export function buildOutputData(
  taskStore: TaskStoreType,
  answerStore: AnswerStoreType,
): AssessmentState {
  const ns = taskStore.activeNamespace
  const schemaStore = useSchemaStore()

  const completedTasks = Array.from(taskStore.completedRootTaskIds[ns]).sort((a, b) => parseInt(a) - parseInt(b))

  const flatAnswers = answerStore.answers[ns] || {}
  const flatTasks = taskStore.flatTasks[ns] || {}

  // Skip answers whose field is currently hidden by a conditional dependency.
  // Matches the pdf and markdown exporters so shareable exports never leak
  // invisible data (AVG + audit consistency).
  const visibleAnswers = filterVisibleAnswers(flatAnswers, taskStore, answerStore)

  return {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: {
      urn: schemaStore.getUrn(ns),
      createdAt: new Date().toISOString(),
      ...(completedTasks.length > 0 && { completedTasks }),
    },
    answers: groupAnswers(visibleAnswers, flatTasks, taskStore.taskInstances[ns]),
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

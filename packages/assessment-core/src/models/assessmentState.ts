import { type Answer } from '../stores/answers'
import { type TaskInstance } from '../stores/tasks'
import { FormType } from './dpia'

export const OUTPUT_SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

export interface AssessmentStateMetadata {
  createdAt: string
  activeNamespace?: FormType
  urn?: string
}

export interface DPIATaskState {
  currentRootTaskId: string
  completedRootTaskIds: string[]
  taskInstances: Record<string, TaskInstance>
}

// Contains namespaced state (used for persistence — localStorage, API)
export interface AssessmentState {
  $schema?: string
  metadata: AssessmentStateMetadata
  taskState?: Partial<Record<FormType, DPIATaskState>>
  answers: Partial<Record<FormType, Record<string, Answer>>>
}

// Clean export format (used for JSON file download)
export interface AssessmentOutput {
  $schema: string
  metadata: {
    createdAt: string
    urn: string
    createdBy?: { name: string; email?: string }
    completedTasks?: string[]
  }
  answers: Record<string, Answer>
}

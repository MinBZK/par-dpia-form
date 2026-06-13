import { type Answer } from '../stores/answers'

export const OUTPUT_SCHEMA_URL = 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json'

export interface IndexedGroupElement {
  _index: number
  [childTaskId: string]: Answer | number  // number is for _index
}

export type GroupedAnswerValue = Answer | IndexedGroupElement[]

export type GroupedAnswers = Record<string, GroupedAnswerValue>

/**
 * The one data format for assessment state — used for DB persistence,
 * file export, file import, and API communication.
 * Validated by schemas/assessment-output.v2.schema.json.
 *
 * Answers are keyed by task ID. Non-repeatable tasks have Answer values.
 * Repeatable parent tasks have IndexedGroupElement[] arrays.
 */
export interface AssessmentState {
  $schema?: string
  metadata: {
    urn?: string
    createdAt: string
    completedTasks?: string[]
    createdBy?: { name: string; email?: string }
  }
  answers: Record<string, GroupedAnswerValue>
}

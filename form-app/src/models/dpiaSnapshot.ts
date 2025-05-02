import { type Answer } from '@/stores/answers'
import { type TaskInstance } from '@/stores/tasks'
import { FormType } from './dpia.ts';

export interface DPIASnapshotMetadata {
  savedAt: string
  activeNamespace?: FormType
}

export interface DPIATaskState {
  currentRootTaskId: string
  completedRootTaskIds: string[]
  taskInstances: Record<string, TaskInstance>
}

// Contains namespaced state
export interface DPIASnapshot {
  metadata: DPIASnapshotMetadata
  taskState: Partial<Record<FormType, DPIATaskState>>
  answers: Partial<Record<FormType, Record<string, Answer>>>
}

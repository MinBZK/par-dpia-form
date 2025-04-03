import { type Answer } from '@/stores/answers'
import { type TaskInstance } from '@/stores/tasks'

export interface DPIASnapshotMetadata {
  savedAt: string
}

export interface DPIATaskState {
  currentRootTaskId: string
  completedRootTaskIds: string[]
  taskInstances: Record<string, TaskInstance>
}

export interface DPIASnapshot {
  metadata: DPIASnapshotMetadata
  taskState: DPIATaskState
  answers: Record<string, Answer>
}

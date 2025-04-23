import { type Answer } from '@/stores/answers'
import { type TaskInstance } from '@/stores/tasks'

export interface DPIASnapshotMetadata {
  savedAt: string
  activeNamespace?: 'dpia' | 'prescan'
}

export interface DPIATaskState {
  currentRootTaskId: string
  completedRootTaskIds: string[]
  taskInstances: Record<string, TaskInstance>
}

// Contains namespaced state
export interface DPIASnapshot {
  metadata: DPIASnapshotMetadata
  taskState: Record<string, DPIATaskState>
  answers: Record<string, Record<string, Answer>>
}

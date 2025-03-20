import { type Answer } from '@/stores/answers'

export interface DPIASnapshotMetadata {
  savedAt: string
}

export interface DPIATaskState {
  currentRootTaskId: string
  taskInstances: Record<string, number>
}

export interface DPIASnapshot {
  metadata: DPIASnapshotMetadata
  taskState: DPIATaskState
  answers: Record<string, Record<number, Answer>>
}

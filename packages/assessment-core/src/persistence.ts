import type { InjectionKey } from 'vue'
import type { AssessmentState } from './models/assessmentState'
import type { FormType } from './models/dpia'

export interface PersistenceProvider {
  saveAppState(): void | Promise<void>
  loadAppState(namespace?: FormType): AssessmentState | null | Promise<AssessmentState | null>
  applyAppState(state: AssessmentState): void
  clearSavedState(namespace?: FormType): void | Promise<void>
  setupWatchers(): (() => void) | void
  /** Cancel any pending debounce and save immediately */
  flushSave?(): void | Promise<void>
  /** Restore UI-only state (e.g. currentRootTaskId) after task structure init. */
  restoreUiState?(): void
  /** Snapshot the current store state as the baseline for change tracking.
   *  Called after full initialization (apply + syncInstances) to avoid
   *  initialization-related diffs being treated as user changes. */
  snapshotBaseline?(): void
}

export const PERSISTENCE_KEY = Symbol('persistence') as InjectionKey<PersistenceProvider>

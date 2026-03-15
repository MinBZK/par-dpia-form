import type { InjectionKey } from 'vue'
import type { DPIASnapshot } from './models/dpiaSnapshot'
import type { FormType } from './models/dpia'

export interface PersistenceProvider {
  saveAppState(): void | Promise<void>
  loadAppState(namespace?: FormType): DPIASnapshot | null | Promise<DPIASnapshot | null>
  applyAppState(snapshot: DPIASnapshot): void
  clearSavedState(namespace?: FormType): void | Promise<void>
  setupWatchers(): (() => void) | void
  /** Cancel any pending debounce and save immediately */
  flushSave?(): void | Promise<void>
}

export const PERSISTENCE_KEY = Symbol('persistence') as InjectionKey<PersistenceProvider>

/**
 * Provider for export functionality (PDF export, etc.)
 * Each app variant provides its own implementation.
 */
export interface ExportProvider {
  exportToPdf: () => Promise<void>
}

export const EXPORT_KEY = Symbol('export') as InjectionKey<ExportProvider>

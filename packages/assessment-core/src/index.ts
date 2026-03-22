// Styles
import './assets/base.css'

// Models
export { FormType, DPIA } from './models/dpia'
export { OUTPUT_SCHEMA_URL } from './models/assessmentState'
export type { AssessmentState, IndexedGroupElement, GroupedAnswerValue, GroupedAnswers } from './models/assessmentState'
export { ViewState } from './models/navigation'
export type { NavigationFunctions } from './models/navigation'

// Stores
export { useTaskStore, taskIsOfTaskType, buildInstanceId, parseInstanceId } from './stores/tasks'
export type { FlatTask, TaskInstance, TaskStoreType } from './stores/tasks'
export { useAnswerStore } from './stores/answers'
export type { AnswerStoreType } from './stores/answers'
export { useSchemaStore } from './stores/schemas'
export { useCalculationStore } from './stores/calculations'
export type { CalculationStoreType } from './stores/calculations'

// Composables
export { useTaskDependencies } from './composables/useTaskDependencies'
export { useTaskNavigation } from './composables/useTaskNavigation'
export { usePreScanReferences } from './composables/usePreScanReferences'
export type { PreScanReference } from './composables/usePreScanReferences'

// Persistence
export { PERSISTENCE_KEY } from './persistence'
export type { PersistenceProvider } from './persistence'

// Utils
export { migrateStateV1toV2 } from './utils/stateMigration'
export { parseAndValidateImport, detectImportType } from './utils/importDetect'
export { applyStateToStores, rebuildRepeatableInstances } from './utils/applyState'
export { exportToJson, buildOutputData } from './utils/jsonExport'
export { exportToMarkdown } from './utils/markdownExport'
export { exportToPdf } from './utils/pdfExport'
export { generateFilename } from './utils/fileName'
export { createConclusionTask, renderInstanceLabel } from './utils/taskUtils'
export { getPlainTextWithoutDefinitions } from './utils/stripHtml'
export { hasInstanceMapping, shouldShowTask } from './utils/dependency'
export { groupAnswers, flattenGroupedAnswers } from './utils/groupedAnswers'

// Components
export { default as Form } from './components/Form.vue'
export { default as AppBanner } from './components/AppBanner.vue'
export { default as NavHeader } from './components/NavHeader.vue'
export { default as ProgressTracker } from './components/ProgressTracker.vue'
export { default as FileUploadPage } from './components/FileUploadPage.vue'
export { default as SaveForm } from './components/SaveForm.vue'
export { default as LiveResults } from './components/LiveResults.vue'
export { default as Results } from './components/Results.vue'
export { default as AssessmentCard } from './components/AssessmentCard.vue'
export { default as PreScanPreview } from './components/PreScanPreview.vue'
export { default as UiButton } from './components/ui/UiButton.vue'
export { default as TaskSection } from './components/task/TaskSection.vue'
export { default as TaskGroup } from './components/task/TaskGroup.vue'
export { default as TaskItem } from './components/task/TaskItem.vue'
export { default as FormField } from './components/task/FormField.vue'

import type { FormType } from '@overheid-assessment/core'

// The assessments the standalone form ships. AIIA exists in the core FormType
// enum but is not wired into this app yet, so it is excluded here to keep the
// navigation maps exhaustive over exactly the forms that have a view.
export type StandaloneFormType = Exclude<FormType, FormType.AIIA>

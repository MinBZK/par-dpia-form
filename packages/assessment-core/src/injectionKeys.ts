import type { InjectionKey, Ref } from 'vue'

// True when the current user may read but not answer: the inputs are inert, the
// text around them (including the term tooltips) stays interactive.
export const CONTENT_READONLY_KEY: InjectionKey<Ref<boolean>> = Symbol('contentReadonly')

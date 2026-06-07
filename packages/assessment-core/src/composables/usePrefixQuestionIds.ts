import { computed, type ComputedRef } from 'vue'
import { useTaskStore } from '../stores/tasks'
import { useSchemaStore } from '../stores/schemas'

/**
 * Whether the active form prefixes labels with their official question ID.
 *
 * IAMA refers to its questions by official numbers (e.g. "4.1.1"), so its labels
 * render as "4.1.1 Aangetaste grondrechten" instead of just the text. This is
 * opt-in per form via `prefixQuestionIds` in the schema (only iama.yaml sets it);
 * DPIA and pre-scan leave it unset, so they render labels without an ID prefix.
 * Callers still skip tasks explicitly marked `is_official_id: false` (Deel headers,
 * actiepunten groups), which are not official numbered questions.
 *
 * Shared by FormField and TaskGroup so the rule lives in one place.
 */
export function usePrefixQuestionIds(): ComputedRef<boolean> {
  const taskStore = useTaskStore()
  const schemaStore = useSchemaStore()
  return computed(
    () => schemaStore.getSchema(taskStore.activeNamespace)?.prefixQuestionIds === true,
  )
}

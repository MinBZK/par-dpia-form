import { computed } from 'vue'
import { useTaskStore } from '@overheid-assessment/core'

/**
 * The chapter a comment field belongs to, walked up the real parent chain.
 *
 * Task ids are display numbers, not a hierarchy: the IAMA's second chapter is
 * "1.0" and holds 1.1 and 1.actiepunten, so neither the first dot-segment nor a
 * prefix match gets it right. A field id can carry a repeat index ("2.1.3[0]"),
 * which the task itself does not have.
 */
export function useRootTaskId() {
  const taskStore = useTaskStore()
  const rootIds = computed(() => new Set(taskStore.getRootTasks.map(t => t.id)))

  function rootTaskIdOf(fieldId: string): string {
    const base = fieldId.startsWith('completed.') ? fieldId.slice('completed.'.length) : fieldId
    const taskId = base.split('[')[0]

    let current = taskId
    const guard = new Set<string>()
    for (;;) {
      const parent = taskStore.getParentTaskId(current)
      if (!parent || guard.has(parent)) break
      guard.add(parent)
      current = parent
    }
    if (rootIds.value.has(current)) return current

    // Not a task we know: a completion id ("completed.3"), or the schema has not
    // loaded yet so the parent chain is still empty. Fall back to the longest
    // root id the field id starts with, and only then to its first segment.
    let best = ''
    for (const id of rootIds.value) {
      if ((taskId === id || taskId.startsWith(`${id}.`)) && id.length > best.length) best = id
    }
    return best || taskId.split('.')[0]
  }

  return { rootTaskIdOf }
}

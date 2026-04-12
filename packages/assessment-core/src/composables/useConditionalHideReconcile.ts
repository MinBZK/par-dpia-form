import { onBeforeUnmount, watch } from 'vue'
import { useAnswerStore, type Answer, type AnswerValue } from '../stores/answers'
import { parseInstanceId, useTaskStore } from '../stores/tasks'
import { findImpactedByConditionalChange } from '../utils/impactedAnswers'
import { createHiddenAnswerCache } from '../utils/hiddenAnswerCache'
import { shouldShowTask } from '../utils/dependency'

/**
 * Keeps persisted state in sync with conditional visibility, with a short
 * in-memory "undo" window. When a field change hides dependents, their
 * answers leave the store (so they get saved out) but stay in the cache
 * for ttlMs; flipping the parent back within the window restores them.
 */
export function useConditionalHideReconcile(ttlMs?: number) {
  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()
  const cache = createHiddenAnswerCache(ttlMs)
  const lastObserved = new Map<string, AnswerValue>()

  // Watcher registers in setup() but must stay inert until seedFromStore()
  // runs after Form.vue's init. Otherwise applyStateToStores + rebuild +
  // syncInstances look like per-answer edits to a freshly-loaded form.
  let armed = false

  function seedFromStore() {
    const ns = taskStore.activeNamespace
    lastObserved.clear()
    for (const [id, answer] of Object.entries(answerStore.answers[ns] || {})) {
      lastObserved.set(id, answer.value)
    }
    armed = true
  }

  function hide(instanceId: string, nextValue: AnswerValue): void {
    const ns = taskStore.activeNamespace
    const toHide = findImpactedByConditionalChange(instanceId, nextValue, taskStore, answerStore)
    if (toHide.length === 0) return
    const entries = toHide
      .map((i) => ({ instanceId: i.instanceId, answer: answerStore.answers[ns][i.instanceId] }))
      .filter((e): e is { instanceId: string; answer: Answer } => !!e.answer)
    cache.store(entries)
    answerStore.removeAnswerForInstances(toHide.map((i) => i.instanceId))
  }

  function restoreNowVisible(): void {
    const ns = taskStore.activeNamespace
    for (const id of cache.keys()) {
      const { taskId } = parseInstanceId(id)
      if (!shouldShowTask(taskId, id, taskStore, answerStore)) continue
      const [entry] = cache.consume([id])
      if (!entry) continue
      answerStore.answers[ns][id] = entry.answer
      lastObserved.set(id, entry.answer.value)
    }
  }

  const stop = watch(
    () => answerStore.answers[taskStore.activeNamespace],
    (current) => {
      if (!armed || !current) return
      const touched: Array<{ id: string; value: AnswerValue }> = []
      for (const [id, answer] of Object.entries(current)) {
        if (lastObserved.get(id) !== answer.value) {
          touched.push({ id, value: answer.value })
          lastObserved.set(id, answer.value)
        }
      }
      for (const id of Array.from(lastObserved.keys())) {
        if (!(id in current)) lastObserved.delete(id)
      }
      for (const { id, value } of touched) hide(id, value)
      if (touched.length > 0) restoreNowVisible()
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    stop()
    cache.clear()
  })

  return { seedFromStore, cache }
}

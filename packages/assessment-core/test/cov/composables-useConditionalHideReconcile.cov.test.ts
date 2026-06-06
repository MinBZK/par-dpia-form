import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useConditionalHideReconcile } from '../../src/composables/useConditionalHideReconcile'
import { FormType, type Task } from '../../src/models/dpia'

/**
 * Task tree:
 *   1 (group)
 *     1.1 radio  — the conditional parent
 *     1.2 text   — shown only when 1.1 === true
 *
 * Plus a repeatable group to exercise index-scoped conditionals:
 *   2 (group)
 *     2.1 (repeatable group)
 *       2.1.1 radio — parent inside the repeatable element
 *       2.1.2 text  — shown only when 2.1.1 === true (within the same element)
 *
 * IMPORTANT: the watcher fires AFTER the store already holds the new value, so
 * `findImpactedByConditionalChange` short-circuits whenever
 * `getAnswer(parent) === nextValue`. To genuinely drive a "hide", we flip the
 * parent to an empty string: `getAnswer` coalesces '' to null (`value || null`)
 * while the watcher captures the raw '' — so original (null) !== next ('') and
 * the conditional ('1.1' equals true) is no longer met, hiding the dependent.
 */
const taskTree: Task[] = [
  {
    id: '1',
    task: 'Sectie 1',
    type: ['task_group'],
    tasks: [
      { id: '1.1', task: 'Schakelaar', type: ['radio_option'] },
      {
        id: '1.2',
        task: 'Toelichting',
        type: ['text_input'],
        dependencies: [
          {
            type: 'conditional',
            action: 'show',
            condition: { id: '1.1', operator: 'equals', value: true },
          },
        ],
      },
    ],
  },
  {
    id: '2',
    task: 'Sectie 2',
    type: ['task_group'],
    tasks: [
      {
        id: '2.1',
        task: 'Herhaalbaar',
        type: ['task_group'],
        repeatable: true,
        tasks: [
          { id: '2.1.1', task: 'Schakelaar', type: ['radio_option'] },
          {
            id: '2.1.2',
            task: 'Toelichting',
            type: ['text_input'],
            dependencies: [
              {
                type: 'conditional',
                action: 'show',
                condition: { id: '2.1.1', operator: 'equals', value: true },
              },
            ],
          },
        ],
      },
    ],
  },
]

/**
 * Mounts a throwaway component whose setup() invokes the composable, so the
 * watch and onBeforeUnmount hooks register against a real component instance.
 * The composable's return value is exposed on the wrapper's vm.
 */
function mountReconcile(ttlMs?: number) {
  const Host = defineComponent({
    setup() {
      const api = useConditionalHideReconcile(ttlMs)
      return { api }
    },
    render: () => null,
  })
  const wrapper = mount(Host)
  return {
    wrapper,
    api: (wrapper.vm as any).api as ReturnType<typeof useConditionalHideReconcile>,
  }
}

function answer(value: string) {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('useConditionalHideReconcile', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(taskTree, true)
  })

  describe('seedFromStore', () => {
    it('seeds lastObserved from the current store and arms the watcher', async () => {
      // Pre-existing answers act as the baseline after seeding.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Bestaande toelichting')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Re-asserting the same value is not a touch, and the visible 1.2 stays.
      answerStore.answers[FormType.DPIA]['1.1'] = { ...answer('true') }
      await nextTick()
      expect(answerStore.answers[FormType.DPIA]['1.2']).toEqual(answer('Bestaande toelichting'))
      expect(api.cache.keys()).toHaveLength(0)

      wrapper.unmount()
    })

    it('handles an empty namespace (answers[ns] undefined falls back to {})', () => {
      // Remove the active namespace map so `answerStore.answers[ns] || {}` takes
      // the fallback branch inside seedFromStore.
      delete (answerStore.answers as Record<string, unknown>)[FormType.DPIA]

      const { wrapper, api } = mountReconcile()
      expect(() => api.seedFromStore()).not.toThrow()

      wrapper.unmount()
    })
  })

  describe('watcher is inert until armed', () => {
    it('does nothing when a change happens before seedFromStore (armed=false)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Toelichting waarde')

      const { wrapper, api } = mountReconcile()
      // No seedFromStore() → armed stays false → watcher returns immediately.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toEqual(answer('Toelichting waarde'))
      expect(api.cache.keys()).toHaveLength(0)

      wrapper.unmount()
    })

    it('ignores a watcher fire when the namespace map becomes undefined (current falsy)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Replace the active namespace map with undefined → `current` is falsy.
      ;(answerStore.answers as Record<string, unknown>)[FormType.DPIA] = undefined
      await nextTick()

      expect(api.cache.keys()).toHaveLength(0)
      wrapper.unmount()
    })
  })

  describe('hide path via the watcher', () => {
    it('caches and removes a dependent answer when its conditional parent stops matching', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Geheime toelichting')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Flip the parent to '' so the conditional no longer holds and 1.2 hides.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()

      // 1.2 left the store...
      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      // ...but is held in the undo cache.
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })

    it('does nothing for a change with no impacted dependents (toHide empty)', async () => {
      // 1.2 has no value, so hiding it impacts nothing → toHide is empty.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()

      expect(api.cache.keys()).toHaveLength(0)
      wrapper.unmount()
    })

    it('hides an index-scoped dependent inside a repeatable element', async () => {
      // Default instance index 0 exists; give 2.1.1[0] and 2.1.2[0] values.
      answerStore.answers[FormType.DPIA]['2.1.1[0]'] = answer('true')
      answerStore.answers[FormType.DPIA]['2.1.2[0]'] = answer('Index nul toelichting')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['2.1.1[0]'] = answer('')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['2.1.2[0]']).toBeUndefined()
      expect(api.cache.keys()).toContain('2.1.2[0]')

      wrapper.unmount()
    })
  })

  describe('restoreNowVisible path via the watcher', () => {
    it('restores a cached answer when the parent becomes matching again within the TTL', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Herstelbare toelichting')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Hide.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      expect(api.cache.keys()).toContain('1.2')

      // Flip back to 'true' → restoreNowVisible repopulates 1.2 from the cache.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toEqual(answer('Herstelbare toelichting'))
      expect(api.cache.keys()).not.toContain('1.2')

      wrapper.unmount()
    })

    it('keeps the cached answer hidden while the task stays not-visible (shouldShowTask false → continue)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Blijft verborgen')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Hide 1.2.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      // Touch the parent again to another non-matching value: this is a touch
      // (so restoreNowVisible runs), but shouldShowTask('1.2') is still false,
      // exercising the `continue` branch in restoreNowVisible.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('nope')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })

    it('drops an entry that expires between keys() and consume() (!entry continue branch)', async () => {
      // A very large TTL keeps the real cache setTimeout dormant for the whole
      // test; only Date.now is manipulated to simulate expiry. (Avoiding fake
      // timers keeps the istanbul coverage writer's async fs ops intact.)
      const ttl = 10_000_000
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Tussentijds verlopen')

      const { wrapper, api } = mountReconcile(ttl)
      api.seedFromStore()

      // Hide 1.2 → cached with expiresAt = now + ttl.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      // Make keys() see the entry as live but consume() see it as expired by
      // controlling Date.now between the two calls inside restoreNowVisible.
      const base = Date.now()
      const nowSpy = vi.spyOn(Date, 'now')
      nowSpy.mockReturnValueOnce(base) // keys(): expiresAt > now → live
      nowSpy.mockReturnValue(base + ttl + 1) // consume(): expired → no entry

      // Flip back to 'true' so shouldShowTask('1.2') is true and consume runs.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      await nextTick()

      nowSpy.mockRestore()

      // The expired entry was dropped without being restored.
      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      wrapper.unmount()
    })
  })

  describe('lastObserved touch detection and cleanup', () => {
    it('deletes lastObserved keys for ids no longer present in current', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['x.1'] = answer('Te verwijderen')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Remove an observed key and touch another in the same tick: the cleanup
      // loop hits the `!(id in current)` branch for x.1.
      delete answerStore.answers[FormType.DPIA]['x.1']
      answerStore.answers[FormType.DPIA]['1.1'] = answer('changed')
      await nextTick()

      // Re-adding x.1 registers as a fresh touch (it was dropped from
      // lastObserved), which is observable as no crash and persisted value.
      answerStore.answers[FormType.DPIA]['x.1'] = answer('Te verwijderen')
      await nextTick()
      expect(answerStore.answers[FormType.DPIA]['x.1']).toEqual(answer('Te verwijderen'))

      wrapper.unmount()
    })

    it('does not treat an unchanged value as a touch (lastObserved.get === answer.value)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Stabiel')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Replace the answer object identity but keep its value equal → deep watch
      // fires but no value differs, so touched stays empty.
      answerStore.answers[FormType.DPIA]['1.1'] = { ...answer('true') }
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toEqual(answer('Stabiel'))
      expect(api.cache.keys()).toHaveLength(0)

      wrapper.unmount()
    })

    it('does not run restoreNowVisible when no value actually changed (touched.length === 0)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Onaangeroerd')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Pre-load the cache directly so we can observe that restoreNowVisible is
      // NOT called for a no-op watcher fire (the entry stays put).
      api.cache.store([{ instanceId: 'phantom', answer: answer('phantom') }])

      // Deep-fire the watcher with no value change.
      answerStore.answers[FormType.DPIA]['1.2'] = { ...answer('Onaangeroerd') }
      await nextTick()

      // restoreNowVisible never ran, so the (unrelated) cache entry survives.
      expect(api.cache.keys()).toContain('phantom')

      wrapper.unmount()
    })
  })

  describe('onBeforeUnmount cleanup', () => {
    it('stops the watcher and clears the cache on unmount', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Wordt opgeruimd')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      // Populate the cache.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      // Unmount triggers onBeforeUnmount: stop() + cache.clear().
      wrapper.unmount()
      expect(api.cache.keys()).toHaveLength(0)

      // Watcher is stopped: further mutations have no effect.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      await nextTick()
      expect(api.cache.keys()).toHaveLength(0)
    })
  })

  describe('default ttlMs parameter', () => {
    it('constructs with the default TTL when no argument is passed', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Default ttl')

      // No ttlMs argument → exercises the default-parameter path of the cache.
      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })
  })
})

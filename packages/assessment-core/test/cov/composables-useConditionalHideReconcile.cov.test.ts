import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useConditionalHideReconcile } from '../../src/composables/useConditionalHideReconcile'
import { FormType, type Task } from '../../src/models/dpia'

// Gotcha: to drive a "hide", flip the parent to '' — getAnswer coalesces '' to
// null while the watcher captures raw '', so original (null) !== next ('') and
// the equals-true conditional stops matching.
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

// Mounts a host component so the composable's watch and onBeforeUnmount hooks
// register against a real instance; the return value is exposed on vm.
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
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Bestaande toelichting')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = { ...answer('true') }
      await nextTick()
      expect(answerStore.answers[FormType.DPIA]['1.2']).toEqual(answer('Bestaande toelichting'))
      expect(api.cache.keys()).toHaveLength(0)

      wrapper.unmount()
    })

    it('handles an empty namespace (answers[ns] undefined falls back to {})', () => {
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
      // Deliberately no seedFromStore() — watcher stays unarmed.
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

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })

    it('does nothing for a change with no impacted dependents (toHide empty)', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()

      expect(api.cache.keys()).toHaveLength(0)
      wrapper.unmount()
    })

    it('hides an index-scoped dependent inside a repeatable element', async () => {
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

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      expect(api.cache.keys()).toContain('1.2')

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

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      // A second non-matching value is still a touch (runs restoreNowVisible) yet
      // 1.2 stays not-visible.
      answerStore.answers[FormType.DPIA]['1.1'] = answer('nope')
      await nextTick()

      expect(answerStore.answers[FormType.DPIA]['1.2']).toBeUndefined()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })

    it('drops an entry that expires between keys() and consume() (!entry continue branch)', async () => {
      // Large TTL + manipulating only Date.now (not fake timers, which would
      // break the istanbul coverage writer's async fs ops) simulates expiry.
      const ttl = 10_000_000
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Tussentijds verlopen')

      const { wrapper, api } = mountReconcile(ttl)
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      // keys() sees the entry live, consume() sees it expired, via Date.now.
      const base = Date.now()
      const nowSpy = vi.spyOn(Date, 'now')
      nowSpy.mockReturnValueOnce(base)
      nowSpy.mockReturnValue(base + ttl + 1)

      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      await nextTick()

      nowSpy.mockRestore()

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

      // Remove an observed key and touch another in the same tick → cleanup loop
      // hits the `!(id in current)` branch for x.1.
      delete answerStore.answers[FormType.DPIA]['x.1']
      answerStore.answers[FormType.DPIA]['1.1'] = answer('changed')
      await nextTick()

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

      // New object identity, equal value → deep watch fires but touched stays empty.
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

      // Pre-loaded unrelated entry survives only if restoreNowVisible never runs.
      api.cache.store([{ instanceId: 'phantom', answer: answer('phantom') }])

      answerStore.answers[FormType.DPIA]['1.2'] = { ...answer('Onaangeroerd') }
      await nextTick()

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

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
      expect(api.cache.keys()).toHaveLength(0)

      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      await nextTick()
      expect(api.cache.keys()).toHaveLength(0)
    })
  })

  describe('default ttlMs parameter', () => {
    it('constructs with the default TTL when no argument is passed', async () => {
      answerStore.answers[FormType.DPIA]['1.1'] = answer('true')
      answerStore.answers[FormType.DPIA]['1.2'] = answer('Default ttl')

      const { wrapper, api } = mountReconcile()
      api.seedFromStore()

      answerStore.answers[FormType.DPIA]['1.1'] = answer('')
      await nextTick()
      expect(api.cache.keys()).toContain('1.2')

      wrapper.unmount()
    })
  })
})

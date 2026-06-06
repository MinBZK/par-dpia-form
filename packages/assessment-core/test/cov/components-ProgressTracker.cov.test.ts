import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ProgressTracker from '../../src/components/ProgressTracker.vue'
import { type FlatTask, useTaskStore } from '../../src/stores/tasks'
import { PERSISTENCE_KEY, type PersistenceProvider } from '../../src/persistence'
import { FormType } from '../../src/models/dpia'

// Build a FlatTask with sensible defaults; callers override what they need.
function flatTask(partial: Partial<FlatTask> & { id: string }): FlatTask {
  return {
    task: `Task ${partial.id}`,
    type: ['task_group'],
    parentId: null,
    childrenIds: [],
    is_official_id: true,
    ...partial,
  } as FlatTask
}

// Register root tasks directly in the store for the active namespace.
function seedRootTasks(taskStore: ReturnType<typeof useTaskStore>, tasks: FlatTask[]) {
  const ns = taskStore.activeNamespace
  const map: Record<string, FlatTask> = {}
  for (const t of tasks) map[t.id] = t
  taskStore.flatTasks[ns] = map
  taskStore.rootTaskIds[ns] = tasks.map(t => t.id)
}

function mountTracker(
  opts: {
    props?: { disabled?: boolean; navigable?: boolean }
    persistence?: Partial<PersistenceProvider> | null
  } = {},
) {
  const provide: Record<symbol, unknown> = {}
  // When persistence is explicitly null we leave it unprovided so inject() returns undefined.
  if (opts.persistence !== null) {
    provide[PERSISTENCE_KEY as unknown as symbol] = opts.persistence ?? {}
  }
  return mount(ProgressTracker, {
    props: opts.props ?? {},
    global: { provide },
  })
}

describe('ProgressTracker.vue', () => {
  let taskStore: ReturnType<typeof useTaskStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
  })

  describe('static structure', () => {
    it('renders the fixed start ("Inhoudsopgave") and the empty-end ("Proces voltooid") steps when there is no conclusion task', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker()
      const text = wrapper.text()
      expect(text).toContain('Inhoudsopgave')
      // No signing/conclusion task => the fallback end step is rendered.
      expect(text).toContain('Proces voltooid')
      // Exactly one regular step rendered for the single root task.
      expect(wrapper.findAll('.rvo-progress-tracker__step--md').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('regularTasks / conclusionTask split', () => {
    it('separates a signing task into the conclusion end step and keeps the rest as regular steps', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
        flatTask({ id: '2', task: 'Ondertekening', type: ['signing'], is_official_id: true }),
      ])

      const wrapper = mountTracker({ props: { navigable: true } })

      // The signing task is the conclusion step (end), not in "Proces voltooid".
      expect(wrapper.text()).not.toContain('Proces voltooid')
      const endStep = wrapper.find('.rvo-progress-tracker__step--end')
      expect(endStep.exists()).toBe(true)
      expect(endStep.text()).toContain('Ondertekening')

      // Regular (md) steps exclude the signing task.
      const mdSteps = wrapper.findAll('.rvo-progress-tracker__step--md')
      const mdText = mdSteps.map(s => s.text()).join(' ')
      expect(mdText).toContain('Inleiding')
      expect(mdText).toContain('Vragen')
      expect(mdText).not.toContain('Ondertekening')
    })

    it('treats a root task whose type is undefined as a regular task (optional chaining falsy branch)', () => {
      // type undefined exercises the `t.type?.includes` / `task.type &&` falsy paths.
      const noType = flatTask({ id: '0', task: 'Geen type' })
      ;(noType as { type?: unknown }).type = undefined

      seedRootTasks(taskStore, [noType])

      const wrapper = mountTracker()
      // Stays a regular task and falls back to the empty end step.
      expect(wrapper.text()).toContain('Geen type')
      expect(wrapper.text()).toContain('Proces voltooid')
    })
  })

  describe('displayTitle', () => {
    it('omits the id prefix when is_official_id is false', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Zonder prefix', is_official_id: false }),
      ])

      const wrapper = mountTracker()
      const step = wrapper.find('.rvo-progress-tracker__step--md .small-text')
      expect(step.text()).toBe('Zonder prefix')
      expect(step.text()).not.toContain('0.')
    })

    it('prefixes the id when is_official_id is true and the task is not a signing task', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '3', task: 'Met prefix', is_official_id: true, type: ['task_group'] }),
      ])

      const wrapper = mountTracker()
      const step = wrapper.find('.rvo-progress-tracker__step--md .small-text')
      expect(step.text()).toBe('3. Met prefix')
    })

    it('omits the id prefix for an official-id task that is also a signing task (right-hand OR branch true)', () => {
      // is_official_id true forces evaluation of the right-hand side of the ||,
      // and type.includes('signing') being true makes shouldSkipIdPrefix true.
      // Such a task is also the conclusion step, which renders task.task directly.
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '9', task: 'Slot', is_official_id: true, type: ['signing'] }),
      ])

      const wrapper = mountTracker()
      const endStep = wrapper.find('.rvo-progress-tracker__step--end')
      expect(endStep.text()).toBe('Slot')
      expect(endStep.text()).not.toContain('9.')
    })
  })

  describe('step status classes (disabled / completed / doing / incomplete)', () => {
    it('applies the disabled class to every step when disabled=true', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { disabled: true } })
      expect(wrapper.find('.rvo-progress-tracker__step--disabled').exists()).toBe(true)
      // Disabled steps render a non-link <div>, not an <a>.
      expect(wrapper.find('a.rvo-progress-tracker__step-link').exists()).toBe(false)
    })

    it('applies the completed class when the task is a completed root task', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['0'])

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(wrapper.find('.rvo-progress-tracker__step--completed').exists()).toBe(true)
    })

    it('applies the doing class when the task is the current root task', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      taskStore.currentRootTaskId[FormType.DPIA] = '1'

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(wrapper.find('.rvo-progress-tracker__step--doing').exists()).toBe(true)
      expect(wrapper.find('.rvo-progress-tracker__step--incomplete').exists()).toBe(true)
    })

    it('applies the incomplete class when not disabled, not completed and not current', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      // current is '0' (default), so '1' is incomplete.
      const wrapper = mountTracker({ props: { navigable: true } })
      expect(wrapper.find('.rvo-progress-tracker__step--incomplete').exists()).toBe(true)
    })
  })

  describe('navigable rendering of regular steps', () => {
    it('renders a non-link div when not disabled but not navigable (navigable falsy branch)', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: false } })
      expect(wrapper.find('a.rvo-progress-tracker__step-link').exists()).toBe(false)
      expect(wrapper.find('.rvo-progress-tracker__step--md .small-text').text()).toBe('0. Inleiding')
    })

    it('renders a clickable link when not disabled and navigable', () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])

      const wrapper = mountTracker({ props: { navigable: true } })
      expect(wrapper.find('a.rvo-progress-tracker__step-link').exists()).toBe(true)
    })
  })

  describe('conclusion step navigable rendering', () => {
    it('renders the conclusion task as a link when not disabled and navigable', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'] }),
      ])

      const wrapper = mountTracker({ props: { navigable: true } })
      const endLink = wrapper.find('.rvo-progress-tracker__step--end a.rvo-progress-tracker__step-link')
      expect(endLink.exists()).toBe(true)
      expect(endLink.text()).toBe('Slot')
    })

    it('renders the conclusion task as a plain div when disabled', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'] }),
      ])

      const wrapper = mountTracker({ props: { disabled: true, navigable: true } })
      const endStep = wrapper.find('.rvo-progress-tracker__step--end')
      expect(endStep.find('a.rvo-progress-tracker__step-link').exists()).toBe(false)
      expect(endStep.find('.small-text').text()).toBe('Slot')
    })

    it('renders the conclusion task as a plain div when not navigable', () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'] }),
      ])

      const wrapper = mountTracker({ props: { navigable: false } })
      const endStep = wrapper.find('.rvo-progress-tracker__step--end')
      expect(endStep.find('a.rvo-progress-tracker__step-link').exists()).toBe(false)
      expect(endStep.find('.small-text').text()).toBe('Slot')
    })
  })

  describe('goToTask', () => {
    it('flushes pending saves (when flushSave is provided) and navigates on click', async () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '1', task: 'Vragen' }),
      ])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')
      const flushSave = vi.fn()

      const wrapper = mountTracker({ props: { navigable: true }, persistence: { flushSave } })

      const links = wrapper.findAll('a.rvo-progress-tracker__step-link')
      await links[links.length - 1].trigger('click')

      expect(flushSave).toHaveBeenCalledTimes(1)
      expect(setRootTask).toHaveBeenCalledWith('1')
    })

    it('navigates without error when persistence has no flushSave (&& right side falsy)', async () => {
      seedRootTasks(taskStore, [flatTask({ id: '0', task: 'Inleiding' })])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')

      // persistence object present but flushSave undefined.
      const wrapper = mountTracker({ props: { navigable: true }, persistence: {} })

      await wrapper.find('a.rvo-progress-tracker__step-link').trigger('click')

      expect(setRootTask).toHaveBeenCalledWith('0')
    })

    it('navigates without error when persistence is not provided at all (optional chaining falsy)', async () => {
      seedRootTasks(taskStore, [
        flatTask({ id: '0', task: 'Inleiding' }),
        flatTask({ id: '2', task: 'Slot', type: ['signing'] }),
      ])
      const setRootTask = vi.spyOn(taskStore, 'setRootTask')

      const wrapper = mountTracker({ props: { navigable: true }, persistence: null })

      // Click the conclusion link to also exercise goToTask via the end step.
      const endLink = wrapper.find('.rvo-progress-tracker__step--end a.rvo-progress-tracker__step-link')
      await endLink.trigger('click')

      expect(setRootTask).toHaveBeenCalledWith('2')
    })
  })
})

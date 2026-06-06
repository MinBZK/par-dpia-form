import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useTaskNavigation } from '../../src/composables/useTaskNavigation'
import { FormType, type Task } from '../../src/models/dpia'

// A simple three-section task tree so rootTasks has length 3.
const taskTree: Task[] = [
  { id: '0', task: 'Inleiding', type: ['task_group'], tasks: [] },
  { id: '1', task: 'Beschrijving', type: ['task_group'], tasks: [] },
  { id: '2', task: 'Persoonsgegevens', type: ['task_group'], tasks: [] },
]

describe('useTaskNavigation', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let scrollToSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(taskTree, true)

    scrollToSpy = vi.fn()
    // window.scrollTo is not implemented in jsdom; provide a stub to assert on.
    vi.stubGlobal('window', { ...window, scrollTo: scrollToSpy })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('reactive state', () => {
    it('exposes currentRootTaskId from the active namespace', () => {
      const nav = useTaskNavigation()
      expect(nav.currentRootTaskId.value).toBe('0')

      taskStore.setRootTask('1')
      expect(nav.currentRootTaskId.value).toBe('1')
    })

    it('exposes rootTasks derived from the store', () => {
      const nav = useTaskNavigation()
      expect(nav.rootTasks.value.map((t) => t.id)).toEqual(['0', '1', '2'])
    })
  })

  describe('goToNext', () => {
    it('advances to the next root task and scrolls to the top', () => {
      const nav = useTaskNavigation()
      expect(nav.currentRootTaskId.value).toBe('0')

      nav.goToNext()

      expect(nav.currentRootTaskId.value).toBe('1')
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })

    it('does not advance past the last root task but still scrolls', () => {
      const nav = useTaskNavigation()
      taskStore.setRootTask('2')

      nav.goToNext()

      // nextRootTask is a no-op at the boundary, but scrollToTop still runs.
      expect(nav.currentRootTaskId.value).toBe('2')
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })
  })

  describe('goToPrevious', () => {
    it('moves to the previous root task and scrolls to the top', () => {
      const nav = useTaskNavigation()
      taskStore.setRootTask('2')

      nav.goToPrevious()

      expect(nav.currentRootTaskId.value).toBe('1')
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })

    it('does not move before the first root task but still scrolls', () => {
      const nav = useTaskNavigation()
      expect(nav.currentRootTaskId.value).toBe('0')

      nav.goToPrevious()

      // previousRootTask is a no-op at the boundary, but scrollToTop still runs.
      expect(nav.currentRootTaskId.value).toBe('0')
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })
  })

  describe('goToTask', () => {
    it('jumps to an arbitrary root task and scrolls to the top', () => {
      const nav = useTaskNavigation()

      nav.goToTask('2')

      expect(nav.currentRootTaskId.value).toBe('2')
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    })
  })

  describe('isFirstTask', () => {
    it('is true when on the first root task', () => {
      const nav = useTaskNavigation()
      expect(nav.currentRootTaskId.value).toBe('0')
      expect(nav.isFirstTask.value).toBe(true)
    })

    it('is false when not on the first root task', () => {
      const nav = useTaskNavigation()
      taskStore.setRootTask('1')
      expect(nav.isFirstTask.value).toBe(false)
    })
  })

  describe('isLastTask', () => {
    it('is true when on the last root task', () => {
      const nav = useTaskNavigation()
      taskStore.setRootTask('2')
      expect(nav.isLastTask.value).toBe(true)
    })

    it('is false when not on the last root task', () => {
      const nav = useTaskNavigation()
      expect(nav.currentRootTaskId.value).toBe('0')
      expect(nav.isLastTask.value).toBe(false)
    })
  })

  describe('empty root task list', () => {
    // Exercises the optional-chaining branches (`rootTasks.value[0]?.id`
    // and `rootTasks.value[lastIndex]?.id`) when there are no root tasks.
    beforeEach(() => {
      setActivePinia(createPinia())
      taskStore = useTaskStore()
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      // Initialize with an empty tree so rootTasks is empty.
      taskStore.init([], true)
    })

    it('isFirstTask and isLastTask handle an empty root task list', () => {
      const nav = useTaskNavigation()

      expect(nav.rootTasks.value).toHaveLength(0)
      // currentRootTaskId is '0', but there is no rootTasks[0], so the
      // optional chaining yields undefined and the comparison is false.
      expect(nav.isFirstTask.value).toBe(false)
      expect(nav.isLastTask.value).toBe(false)
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useTaskStore,
  taskIsOfTaskType,
  buildInstanceId,
  parseInstanceId,
  type FlatTask,
} from '../../src/stores/tasks'
import { FormType, type Task } from '../../src/models/dpia'

const taskTree: Task[] = [
  {
    id: '0',
    task: 'Inleiding',
    type: ['task_group'],
    tasks: [{ id: '0.1', task: 'Projectnaam', type: ['text_input'] }],
  },
  {
    id: '2',
    task: 'Persoonsgegevens',
    type: ['task_group'],
    tasks: [
      {
        id: '2.1',
        task: 'Persoonsgegeven',
        type: ['task_group'],
        repeatable: true,
        instance_label_template: 'Persoonsgegeven {index}',
        tasks: [
          { id: '2.1.1', task: 'Naam', type: ['text_input'] },
          { id: '2.1.2', task: 'Categorie', type: ['text_input'] },
        ],
      },
    ],
  },
]

function freshStore() {
  setActivePinia(createPinia())
  const store = useTaskStore()
  store.setActiveNamespace(FormType.DPIA)
  store.init(taskTree, true)
  return store
}

describe('taskIsOfTaskType (standalone helper)', () => {
  it('returns true when the type is present', () => {
    const task: FlatTask = {
      id: 'x',
      task: 'X',
      type: ['task_group', 'text_input'],
      parentId: null,
      childrenIds: [],
    }
    expect(taskIsOfTaskType(task, 'text_input')).toBe(true)
    expect(taskIsOfTaskType(task, 'date')).toBe(false)
  })

  it('returns undefined (falsy) when type is missing via optional chaining', () => {
    const task = { id: 'x', task: 'X', parentId: null, childrenIds: [] } as unknown as FlatTask
    expect(taskIsOfTaskType(task, 'text_input')).toBeUndefined()
  })
})

describe('re-exported instanceId helpers', () => {
  it('buildInstanceId / parseInstanceId are re-exported from the store module', () => {
    expect(buildInstanceId('2.1.3', 0)).toBe('2.1.3[0]')
    expect(buildInstanceId('2.1.3')).toBe('2.1.3')
    expect(parseInstanceId('2.1.3[2]')).toEqual({ taskId: '2.1.3', index: 2 })
    expect(parseInstanceId('2.1.3')).toEqual({ taskId: '2.1.3' })
  })
})

describe('init / createTasks / createDefaultInstances', () => {
  it('builds the flat task tree and default instances', () => {
    const store = freshStore()
    expect(store.rootTaskIds[FormType.DPIA]).toEqual(['0', '2'])
    expect(store.flatTasks[FormType.DPIA]['2'].childrenIds).toEqual(['2.1'])
    expect(store.flatTasks[FormType.DPIA]['2.1'].childrenIds).toEqual(['2.1.1', '2.1.2'])
    expect(store.flatTasks[FormType.DPIA]['0.1'].parentId).toBe('0')
    expect(store.isInitialized[FormType.DPIA]).toBe(true)

    expect(store.getInstanceIdsForTask('0')).toEqual(['0'])
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('init without forceInit is a no-op when already initialized', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])

    store.init(taskTree, false)
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])
  })

  it('forceInit re-initializes and clears prior state', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    store.init(taskTree, true)
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('init creates default instances on first initialization', () => {
    setActivePinia(createPinia())
    const store = useTaskStore()
    store.setActiveNamespace(FormType.DPIA)
    store.init(taskTree, false)
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('init uses the default forceInit=false when called with one argument', () => {
    setActivePinia(createPinia())
    const store = useTaskStore()
    store.setActiveNamespace(FormType.DPIA)
    store.init(taskTree)
    expect(store.isInitialized[FormType.DPIA]).toBe(true)
    expect(store.getInstanceIdsForTask('0')).toEqual(['0'])
  })

  it('createDefaultInstances logs an error and returns when there are no root tasks', () => {
    setActivePinia(createPinia())
    const store = useTaskStore()
    store.setActiveNamespace(FormType.DPIA)
    store.init([], true)
    expect(store.rootTaskIds[FormType.DPIA]).toEqual([])
    expect(Object.keys(store.taskInstances[FormType.DPIA])).toEqual([])
  })
})

describe('setActiveNamespace', () => {
  it('does nothing when the namespace is unchanged', () => {
    const store = freshStore()
    store.setRootTask('2')
    store.setActiveNamespace(FormType.DPIA)
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('2')
  })

  it('resets currentRootTaskId to first root when switching to a populated namespace', () => {
    const store = freshStore()
    store.setActiveNamespace(FormType.PRE_SCAN)
    store.init(taskTree, true)
    store.setRootTask('2')
    store.setActiveNamespace(FormType.DPIA)
    store.setActiveNamespace(FormType.PRE_SCAN)
    expect(store.currentRootTaskId[FormType.PRE_SCAN]).toBe('0')
  })

  it('resets currentRootTaskId to "0" when switching to an empty namespace', () => {
    const store = freshStore()
    store.setActiveNamespace(FormType.PRE_SCAN)
    expect(store.currentRootTaskId[FormType.PRE_SCAN]).toBe('0')
  })
})

describe('getNamespacedState', () => {
  it('returns the slice for the active namespace', () => {
    const store = freshStore()
    const state = store.getNamespacedState
    expect(state.rootTaskIds).toEqual(['0', '2'])
    expect(state.isInitialized).toBe(true)
    expect(state.currentRootTaskId).toBe('0')
    expect(state.completedRootTaskIds).toBeInstanceOf(Set)
    expect(state.flatTasks['0'].id).toBe('0')
    expect(state.taskInstances['0'].id).toBe('0')
  })
})

describe('addRepeatableTaskInstance', () => {
  it('returns empty string for a non-repeatable task', () => {
    const store = freshStore()
    expect(store.addRepeatableTaskInstance('0', undefined)).toBe('')
  })

  it('creates a new indexed instance with a fresh group for a repeatable task', () => {
    const store = freshStore()
    const id = store.addRepeatableTaskInstance('2.1', '2')
    expect(id).toBe('2.1[1]')
    const first = store.getInstanceById('2.1[0]')!
    const second = store.getInstanceById('2.1[1]')!
    expect(first.groupId).not.toBe(second.groupId)
  })

  it('honours a specificIndex when provided', () => {
    const store = freshStore()
    const id = store.addRepeatableTaskInstance('2.1', '2', 5)
    expect(id).toBe('2.1[5]')
    expect(store.getInstanceIdsForTask('2.1.1', '2.1[5]')).toEqual(['2.1.1[5]'])
  })
})

describe('createTaskInstance branches via public API', () => {
  it('child of a repeatable parent gets an index even without specificIndex', () => {
    const store = freshStore()
    const id = store.addRepeatableTaskInstance('2.1', '2')
    expect(id).toBe('2.1[1]')
    expect(store.getInstanceById('2.1.1[1]')!.taskId).toBe('2.1.1')
  })

  it('nextAvailableIndex treats a non-indexed instance id as index -1', () => {
    const store = freshStore()
    delete store.taskInstances[FormType.DPIA]['2.1[0]']
    store.taskInstances[FormType.DPIA]['2.1'] = {
      id: '2.1',
      taskId: '2.1',
      groupId: 'g',
      parentInstanceId: '2',
      childInstanceIds: [],
    }
    const id = store.addRepeatableTaskInstance('2.1', '2')
    expect(id).toBe('2.1[0]')
  })
})

describe('removeRepeatableTaskInstance', () => {
  it('returns early when the instance does not exist', () => {
    const store = freshStore()
    expect(() => store.removeRepeatableTaskInstance('nope')).not.toThrow()
  })

  it('removes an instance, its children, and unlinks it from its parent', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])

    store.removeRepeatableTaskInstance('2.1[0]')

    expect(store.getInstanceIdsForTask('2.1')).toEqual(['2.1[1]'])
    expect(store.getInstanceById('2.1.1[0]')).toBeNull()
    const parent = store.getInstanceById('2')!
    expect(parent.childInstanceIds).not.toContain('2.1[0]')
  })

  it('handles an instance whose parent reference is dangling', () => {
    const store = freshStore()
    const id = store.addRepeatableTaskInstance('2.1', '2')
    delete store.taskInstances[FormType.DPIA]['2']
    expect(() => store.removeRepeatableTaskInstance(id)).not.toThrow()
    expect(store.getInstanceById(id)).toBeNull()
  })
})

describe('getInstancesForTask / getInstanceIdsForTask', () => {
  it('filters by parentInstanceId when provided', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    const onlyFirst = store.getInstancesForTask('2.1.1', '2.1[0]')
    expect(onlyFirst.map((i) => i.id)).toEqual(['2.1.1[0]'])
  })

  it('returns all instances of a task when parentInstanceId is omitted', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    const all = store.getInstanceIdsForTask('2.1.1')
    expect(all.sort()).toEqual(['2.1.1[0]', '2.1.1[1]'])
  })
})

describe('getRootTaskInstanceIds', () => {
  it('returns instance ids for a root task', () => {
    const store = freshStore()
    expect(store.getRootTaskInstanceIds('0')).toEqual(['0'])
  })

  it('throws for a non-root task', () => {
    const store = freshStore()
    expect(() => store.getRootTaskInstanceIds('2.1')).toThrow('Task 2.1 is not a root task.')
  })
})

describe('findRelatedInstance', () => {
  it('returns null when the current instance does not exist', () => {
    const store = freshStore()
    expect(store.findRelatedInstance('2.1.1', 'missing')).toBeNull()
  })

  it('finds a sibling instance sharing the same groupId', () => {
    const store = freshStore()
    const related = store.findRelatedInstance('2.1.2', '2.1.1[0]')
    expect(related?.id).toBe('2.1.2[0]')
  })

  it('returns null when no related instance shares the groupId', () => {
    const store = freshStore()
    const related = store.findRelatedInstance('2.1.2', '0.1')
    expect(related).toBeNull()
  })
})

describe('setInstanceMappingSource', () => {
  it('sets the mapping source on an existing instance', () => {
    const store = freshStore()
    store.setInstanceMappingSource('2.1[0]', 'src-instance')
    expect(store.getInstanceById('2.1[0]')!.mappedFromInstanceId).toBe('src-instance')
  })

  it('is a no-op for a non-existent instance', () => {
    const store = freshStore()
    expect(() => store.setInstanceMappingSource('does-not-exist', 'src')).not.toThrow()
    expect(store.getInstanceById('does-not-exist')).toBeNull()
  })
})

describe('root task navigation', () => {
  it('setRootTask sets the current root', () => {
    const store = freshStore()
    store.setRootTask('2')
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('2')
  })

  it('nextRootTask advances when a next root exists', () => {
    const store = freshStore()
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('0')
    store.nextRootTask()
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('1')
  })

  it('nextRootTask does nothing at the last root', () => {
    const store = freshStore()
    store.setRootTask('1')
    store.nextRootTask()
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('1')
  })

  it('previousRootTask goes back when possible', () => {
    const store = freshStore()
    store.setRootTask('1')
    store.previousRootTask()
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('0')
  })

  it('previousRootTask does nothing at the first root', () => {
    const store = freshStore()
    store.setRootTask('0')
    store.previousRootTask()
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('0')
  })
})

describe('completion tracking', () => {
  it('toggles completion on and off for a root task', () => {
    const store = freshStore()
    expect(store.isRootTaskCompleted('0')).toBe(false)
    store.toggleCompleteForTaskId('0')
    expect(store.isRootTaskCompleted('0')).toBe(true)
    store.toggleCompleteForTaskId('0')
    expect(store.isRootTaskCompleted('0')).toBe(false)
  })

  it('throws when toggling completion on a non-root task', () => {
    const store = freshStore()
    expect(() => store.toggleCompleteForTaskId('2.1')).toThrow(
      'Task with id 2.1 is not a root task',
    )
  })
})

describe('getters', () => {
  it('taskById returns the task or throws when missing', () => {
    const store = freshStore()
    expect(store.taskById('2.1').id).toBe('2.1')
    expect(() => store.taskById('nope')).toThrow('Task with id nope not found')
  })

  it('getRootTasks returns root FlatTasks', () => {
    const store = freshStore()
    expect(store.getRootTasks.map((t) => t.id)).toEqual(['0', '2'])
  })

  it('getParentTaskId returns the parent, or null for roots and missing tasks', () => {
    const store = freshStore()
    expect(store.getParentTaskId('2.1')).toBe('2')
    expect(store.getParentTaskId('0')).toBeNull()
    expect(store.getParentTaskId('missing')).toBeNull()
  })

  it('getChildTaskIds returns children, or [] for missing tasks', () => {
    const store = freshStore()
    expect(store.getChildTaskIds('2')).toEqual(['2.1'])
    expect(store.getChildTaskIds('missing')).toEqual([])
  })

  it('getInstanceById returns the instance or null', () => {
    const store = freshStore()
    expect(store.getInstanceById('2.1[0]')!.id).toBe('2.1[0]')
    expect(store.getInstanceById('missing')).toBeNull()
  })
})

describe('namespace-scoped getters', () => {
  it('getTasksFromNamespace returns the map, or {} for an unset namespace', () => {
    const store = freshStore()
    expect(store.getTasksFromNamespace(FormType.DPIA)['0'].id).toBe('0')
    delete (store.flatTasks as Record<string, unknown>)[FormType.PRE_SCAN]
    expect(store.getTasksFromNamespace(FormType.PRE_SCAN)).toEqual({})
  })

  it('getTaskByIdFromNamespace returns task, null for missing id, null for missing namespace', () => {
    const store = freshStore()
    expect(store.getTaskByIdFromNamespace(FormType.DPIA, '2.1')!.id).toBe('2.1')
    expect(store.getTaskByIdFromNamespace(FormType.DPIA, 'nope')).toBeNull()
    delete (store.flatTasks as Record<string, unknown>)[FormType.PRE_SCAN]
    expect(store.getTaskByIdFromNamespace(FormType.PRE_SCAN, '0')).toBeNull()
  })

  it('getTaskInstancesFromNamespace returns the map, or {} for an unset namespace', () => {
    const store = freshStore()
    expect(store.getTaskInstancesFromNamespace(FormType.DPIA)['0'].id).toBe('0')
    delete (store.taskInstances as Record<string, unknown>)[FormType.PRE_SCAN]
    expect(store.getTaskInstancesFromNamespace(FormType.PRE_SCAN)).toEqual({})
  })

  it('getInstancesForTaskFromNamespace filters by parent and falls back to {}', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    expect(
      store.getInstancesForTaskFromNamespace(FormType.DPIA, '2.1').map((i) => i.id).sort(),
    ).toEqual(['2.1[0]', '2.1[1]'])
    expect(
      store.getInstancesForTaskFromNamespace(FormType.DPIA, '2.1.1', '2.1[0]').map((i) => i.id),
    ).toEqual(['2.1.1[0]'])
    delete (store.taskInstances as Record<string, unknown>)[FormType.PRE_SCAN]
    expect(store.getInstancesForTaskFromNamespace(FormType.PRE_SCAN, '2.1')).toEqual([])
  })

  it('getInstanceIdsForTaskFromNamespace returns ids', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    expect(
      store.getInstanceIdsForTaskFromNamespace(FormType.DPIA, '2.1').sort(),
    ).toEqual(['2.1[0]', '2.1[1]'])
  })
})

describe('reset', () => {
  it('clears all namespaces back to initial state', () => {
    const store = freshStore()
    store.addRepeatableTaskInstance('2.1', '2')
    store.toggleCompleteForTaskId('0')
    store.setActiveNamespace(FormType.PRE_SCAN)

    store.reset()

    expect(store.activeNamespace).toBe(FormType.DPIA)
    expect(store.flatTasks[FormType.DPIA]).toEqual({})
    expect(store.flatTasks[FormType.PRE_SCAN]).toEqual({})
    expect(store.taskInstances[FormType.DPIA]).toEqual({})
    expect(store.currentRootTaskId[FormType.DPIA]).toBe('0')
    expect(store.rootTaskIds[FormType.DPIA]).toEqual([])
    expect(store.isInitialized[FormType.DPIA]).toBe(false)
    expect(store.completedRootTaskIds[FormType.DPIA].size).toBe(0)
  })
})

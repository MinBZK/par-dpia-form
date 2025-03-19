import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { Task, TaskTypeValue, Source } from '@/models/dpia'

export interface FlatTask {
  id: string
  task: string
  type: TaskTypeValue[]
  description?: string
  category?: string
  repeatable?: boolean
  options?: string[]
  sources?: Source[]
  parentId: string | null
  childrenIds: string[]
}

export const useTaskStore = defineStore('TaskStore', () => {
  // Properties
  const flatTasks = ref<Record<string, FlatTask>>({})
  const taskInstances = ref<Record<string, number>>({})
  const rootTaskIds = ref<string[]>([])
  const currentRootTaskId = ref('0')

  // Actions
  function init(tasks: Task[]) {
    flattenTasks(tasks)
  }

  function flattenTasks(tasks: Task[], parentId: string | null = null) {
    tasks.forEach((task) => {
      const flatTask: FlatTask = {
        id: task.id,
        task: task.task,
        type: task.type,
        description: task.description,
        category: task.category,
        repeatable: task.repeatable,
        options: task.options,
        sources: task.sources,
        parentId,
        childrenIds: [],
      }

      flatTasks.value[task.id] = flatTask
      taskInstances.value[task.id] = 1

      if (parentId) {
        flatTasks.value[parentId].childrenIds.push(task.id)
      } else {
        rootTaskIds.value.push(task.id)
      }

      // Process children recursively (only during initialization)
      if (task.tasks && task.tasks.length > 0) {
        flattenTasks(task.tasks, task.id)
      }
    })
  }

  function setRootTask(id: string) {
    currentRootTaskId.value = id
  }

  function nextRootTask() {
    const currentId = parseInt(currentRootTaskId.value, 10)
    const nextId = currentId + 1
    if (nextId < rootTaskIds.value.length) {
      setRootTask(nextId.toString())
    }
  }

  function previousRootTask() {
    const currentId = parseInt(currentRootTaskId.value, 10)
    const nextId = currentId - 1
    if (nextId >= 0) {
      setRootTask(nextId.toString())
    }
  }

  function addRepeatableTaskInstance(id: string) {
    const task = taskById.value(id)
    if (task.repeatable) {
      _addTaskInstance(id)
    }
  }

  function removeRepeatableTaskInstance(id: string) {
    const task = taskById.value(id)
    if (task.repeatable) {
      _removeTaskInstance(id)
    }
  }

  function _addTaskInstance(id: string) {
    const task = taskById.value(id)
    taskInstances.value[id]++
    if (task.childrenIds.length > 0) {
      for (const childId of task.childrenIds) {
        _addTaskInstance(childId)
      }
    }
  }


  function _removeTaskInstance(id: string) {
    const task = taskById.value(id)
    taskInstances.value[id]--
    if (task.childrenIds.length > 0) {
      for (const childId of task.childrenIds) {
        _removeTaskInstance(childId)
      }
    }
  }

  // Getters
  const taskById = computed(() => {
    return (taskId: string): FlatTask => {
      const task = flatTasks.value[taskId]

      if (!task) {
        throw new Error(`Task with id "${taskId} not found`)
      }

      return task
    }
  })

  const getRootTasks = computed(() => {
    return rootTaskIds.value.map(id => flatTasks.value[id])
  })

  const getParentTaskId = computed(() => {
    return (taskId: string): string | null => {
      return flatTasks.value[taskId]?.parentId || null
    }
  })

  const getChildTaskIds = computed(() => {
    return (taskId: string): string[] => {
      return flatTasks.value[taskId]?.childrenIds || []
    }
  })

  const getInstance = computed(() => {
    return (taskId: string): number => {
      return taskInstances.value[taskId]
    }
  })

  return {
    // Properties
    flatTasks,
    rootTaskIds,
    currentRootTaskId,
    taskInstances,

    // Actions
    init,
    setRootTask,
    nextRootTask,
    previousRootTask,
    addRepeatableTaskInstance,
    removeRepeatableTaskInstance,

    // Getters
    taskById,
    getRootTasks,
    getParentTaskId,
    getChildTaskIds,
    getInstance,
  }
})

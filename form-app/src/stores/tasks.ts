import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { Task, TaskTypeValue, Source, Dependency, Option } from '@/models/dpia'

export interface FlatTask {
  id: string
  task: string
  type: TaskTypeValue[]
  description?: string
  category?: string
  repeatable?: boolean
  options?: Option[]
  sources?: Source[]
  dependencies?: Dependency[]
  instance_label_template?: string
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
        dependencies: task.dependencies,
        instance_label_template: task.instance_label_template,
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

  function syncInstancesFromAnswers(answers: Record<string, Record<number, any>>): void {
    // For each task with answers...
    for (const taskId in answers) {
      if (taskId in flatTasks.value) {
        const instanceNumbers = Object.keys(answers[taskId]).map(Number);
        if (instanceNumbers.length > 0) {
          const maxInstance = Math.max(...instanceNumbers);

          // Only update if we need more instances than currently exist
          if (maxInstance > taskInstances.value[taskId]) {
            taskInstances.value[taskId] = maxInstance;
          }
        }
      }
    }

    // If a parent has children with data, ensure parent has enough instances
    for (const taskId in flatTasks.value) {
      const task = flatTasks.value[taskId];

      // Only needed for repeatable tasks that are parents
      if (task.repeatable && task.childrenIds.length > 0) {
        // Check each child
        for (const childId of task.childrenIds) {
          // If child has more instances than parent, update parent
          if (taskInstances.value[childId] > taskInstances.value[taskId]) {
            taskInstances.value[taskId] = taskInstances.value[childId];
          }
        }
      }
    }
  }

  function syncInstancesFromSource(taskId: string, count: number): void {
    const currentCount = taskInstances.value[taskId] || 0

    if (count > currentCount) {
      taskInstances.value[taskId] = count
    } else if (count < currentCount) {
      taskInstances.value[taskId] = count
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
    syncInstancesFromAnswers,
    syncInstancesFromSource,

    // Getters
    taskById,
    getRootTasks,
    getParentTaskId,
    getChildTaskIds,
    getInstance,
  }
})

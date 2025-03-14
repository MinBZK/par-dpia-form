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
  const rootTaskIds = ref<string[]>([])
  const currentTaskId = ref('0')

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

  function setTask(id: string) {
    currentTaskId.value = id
  }

  function nextTask() {
    const currentId = parseInt(currentTaskId.value, 10)
    const nextId = currentId + 1
    if (nextId < rootTaskIds.value.length) {
      currentTaskId.value = nextId.toString()
    }
  }

  function previousTask() {
    const currentId = parseInt(currentTaskId.value, 10)
    const nextId = currentId - 1
    if (nextId >=0 ) {
      currentTaskId.value = nextId.toString()
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

  return {
    // Properties
    flatTasks,
    rootTaskIds,
    currentTaskId,

    // Actions
    init,
    setTask,
    nextTask,
    previousTask,

    // Getters
    taskById,
    getRootTasks,
    getParentTaskId,
    getChildTaskIds,
  }
})

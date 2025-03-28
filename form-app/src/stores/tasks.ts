import { Dependency, Option, Source, Task, TaskTypeValue } from '@/models/dpia'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface FlatTask {
  id: string
  task: string
  type: TaskTypeValue[]
  parentId: string | null
  childrenIds: string[]
  description?: string
  category?: string
  repeatable?: boolean
  options?: Option[]
  sources?: Source[]
  dependencies?: Dependency[]
  instance_label_template?: string
}

export interface TaskInstance {
  id: string
  taskId: string
  groupId: string
  parentInstanceId: string | null
  childInstanceIds: string[]
  mappedFromInstanceId?: string
}

export const useTaskStore = defineStore('TaskStore', () => {
  /**
   * ==============================================
   * Store properties
   * ==============================================
   */

  const flatTasks = ref<Record<string, FlatTask>>({})
  const taskInstances = ref<Record<string, TaskInstance>>({})
  const currentRootTaskId = ref('0')
  const rootTaskIds = ref<string[]>([])

  /**
   * ==============================================
   * Store actions
   * ==============================================
   */
  function init(tasks: Task[]) {
    createTasks(tasks)
    rootTaskIds.value.forEach((taskId) => {
      createTaskInstance(taskId)
    })
  }

  function createTasks(tasks: Task[], parentId: string | null = null) {
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

      if (parentId) {
        flatTasks.value[parentId].childrenIds.push(task.id)
      } else {
        rootTaskIds.value.push(task.id)
      }

      if (task.tasks && task.tasks.length > 0) {
        createTasks(task.tasks, task.id)
      }
    })
  }

  function createTaskInstance(taskId: string, parentInstanceId?: string): string {
    const instanceId = taskId + '_' + nanoid()

    let groupId
    if (parentInstanceId) {
      groupId = taskInstances.value[parentInstanceId].groupId
    } else {
      groupId = taskId + '_' + nanoid()
    }
    taskInstances.value[instanceId] = {
      id: instanceId,
      taskId,
      parentInstanceId: parentInstanceId || null,
      childInstanceIds: [],
      groupId,
    }

    if (parentInstanceId && taskInstances.value[parentInstanceId]) {
      taskInstances.value[parentInstanceId].childInstanceIds.push(instanceId)
    }

    const childTaskIds = flatTasks.value[taskId].childrenIds
    if (childTaskIds.length > 0) {
      childTaskIds.forEach((childTaskId) => {
        createTaskInstance(childTaskId, instanceId)
      })
    }
    return instanceId
  }

  function addRepeatableTaskInstance(taskId: string, parentInstanceId?: string): string {
    const task = taskById.value(taskId)
    if (!task.repeatable) return ''
    return createTaskInstance(taskId, parentInstanceId)
  }

  function removeRepeatableTaskInstance(instanceId: string): void {
    const instance = taskInstances.value[instanceId]

    if (!instance) return

    const childrenToRemove = [...instance.childInstanceIds]
    childrenToRemove.forEach((childId) => {
      removeRepeatableTaskInstance(childId)
    })

    if (instance.parentInstanceId && taskInstances.value[instance.parentInstanceId]) {
      const parent = taskInstances.value[instance.parentInstanceId]
      parent.childInstanceIds = parent.childInstanceIds.filter((id) => id !== instanceId)
    }

    delete taskInstances.value[instanceId]
  }

  function getInstancesForTask(taskId: string, parentInstanceId?: string): TaskInstance[] {
    return Object.values(taskInstances.value).filter(
      (instance) =>
        instance.taskId === taskId &&
        (parentInstanceId === undefined || instance.parentInstanceId === parentInstanceId),
    )
  }

  function getInstanceIdsForTask(taskId: string, parentInstanceId?: string): string[] {
    return getInstancesForTask(taskId, parentInstanceId).map((instance) => instance.id)
  }

  function findRelatedInstance(
    conditionTaskId: string,
    currentInstanceId: string,
  ): TaskInstance | null {
    const currentInstance = taskInstances.value[currentInstanceId]
    if (!currentInstance) return null

    const relatedInstance = Object.values(taskInstances.value).find(
      (instance) =>
        instance.taskId === conditionTaskId && instance.groupId === currentInstance.groupId,
    )
    return relatedInstance || null
  }

  function setInstanceMappingSource(instanceId: string, sourceInstanceId: string): void {
    if (taskInstances.value[instanceId]) {
      taskInstances.value[instanceId].mappedFromInstanceId = sourceInstanceId
    }
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

  /**
   * ==============================================
   * Store getters
   * ==============================================
   */
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
    return rootTaskIds.value.map((id) => flatTasks.value[id])
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

  const getInstanceById = computed(() => {
    return (instanceId: string): TaskInstance | null => {
      return taskInstances.value[instanceId] || null
    }
  })

  return {
    // Properties
    flatTasks,
    taskInstances,
    currentRootTaskId,
    rootTaskIds,

    // Actions
    init,
    addRepeatableTaskInstance,
    removeRepeatableTaskInstance,
    getInstancesForTask,
    getInstanceIdsForTask,
    findRelatedInstance,
    setInstanceMappingSource,
    setRootTask,
    nextRootTask,
    previousRootTask,

    // Getters
    taskById,
    getRootTasks,
    getParentTaskId,
    getChildTaskIds,
    getInstanceById,
  }
})

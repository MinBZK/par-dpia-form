import { Dependency, Option, Source, Task, TaskTypeValue, FormType } from '@/models/dpia'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface FlatTask {
  id: string
  task: string
  type: TaskTypeValue[]
  parentId: string | null
  childrenIds: string[]
  valueType?: string
  description?: string
  category?: string
  repeatable?: boolean
  options?: Option[]
  sources?: Source[]
  dependencies?: Dependency[]
  instance_label_template?: string
  defaultValue?: boolean | string | null
}

export function taskIsOfTaskType(task: FlatTask, type: TaskTypeValue): boolean {
  return task.type?.includes(type)
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

  const activeNamespace = ref(FormType.DPIA)
  const flatTasks = ref<Record<FormType, Record<string, FlatTask>>>({
    [FormType.DPIA]: {},
    [FormType.PRE_SCAN]: {},
  })
  const taskInstances = ref<Record<FormType, Record<string, TaskInstance>>>({
    [FormType.DPIA]: {},
    [FormType.PRE_SCAN]: {},
  })
  const currentRootTaskId = ref<Record<FormType, string>>({
    [FormType.DPIA]: "0",
    [FormType.PRE_SCAN]: "0",
  })
  const rootTaskIds = ref<Record<FormType, string[]>>({
    [FormType.DPIA]: [],
    [FormType.PRE_SCAN]: [],
  })
  const isInitialized = ref<Record<FormType, boolean>>({
    [FormType.DPIA]: false,
    [FormType.PRE_SCAN]: false,
  })
  const completedRootTaskIds = ref<Record<FormType, Set<string>>>({
    [FormType.DPIA]: new Set(),
    [FormType.PRE_SCAN]: new Set(),
  })

  /**
   * ==============================================
   * Store actions
   * ==============================================
   */

  const getNamespacedState = computed(() => ({
    flatTasks: flatTasks.value[activeNamespace.value],
    taskInstances: taskInstances.value[activeNamespace.value],
    currentRootTaskId: currentRootTaskId.value[activeNamespace.value],
    rootTaskIds: rootTaskIds.value[activeNamespace.value],
    isInitialized: isInitialized.value[activeNamespace.value],
    completedRootTaskIds: completedRootTaskIds.value[activeNamespace.value],
  }))

  function setActiveNamespace(namespace: FormType) {
    if (activeNamespace.value !== namespace) {
      activeNamespace.value = namespace

      // Reset the current root task ID to the first task if we have any
      if (rootTaskIds.value[namespace] && rootTaskIds.value[namespace].length > 0) {
        currentRootTaskId.value[namespace] = rootTaskIds.value[namespace][0]
      } else {
        currentRootTaskId.value[namespace] = '0'
      }
    }
  }

  function clearStateForNamespace(namespace: FormType): void {
    flatTasks.value[namespace] = {}
    taskInstances.value[namespace] = {}
    currentRootTaskId.value[namespace] = '0'
    rootTaskIds.value[namespace] = []
    completedRootTaskIds.value[namespace] = new Set()
  }

  function init(tasks: Task[], forceInit: boolean = false) {
    const namespace = activeNamespace.value

    if (forceInit) {
      isInitialized.value[namespace] = false
    }

    if (!isInitialized.value[namespace]) {
      clearStateForNamespace(namespace)
      createTasks(tasks)

      if (Object.keys(taskInstances.value[namespace]).length === 0) {
        createDefaultInstances()
      }
      isInitialized.value[namespace] = true
    }
  }

  function createTasks(tasks: Task[], parentId: string | null = null) {
    if (!parentId) {
      rootTaskIds.value[activeNamespace.value] = []
    }
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
        valueType: task.valueType,
        defaultValue: task.defaultValue,
        parentId,
        childrenIds: [],
      }

      flatTasks.value[activeNamespace.value][task.id] = flatTask

      if (parentId) {
        flatTasks.value[activeNamespace.value][parentId].childrenIds.push(task.id)
      } else {
        rootTaskIds.value[activeNamespace.value].push(task.id)
      }

      if (task.tasks && task.tasks.length > 0) {
        createTasks(task.tasks, task.id)
      }
    })
  }

  function createTaskInstance(
    taskId: string,
    parentInstanceId?: string,
    forceNewGroupId: boolean = false,
  ): string {
    const instanceId = taskId + '_' + nanoid()

    let groupId
    if (parentInstanceId && !forceNewGroupId) {
      groupId = taskInstances.value[activeNamespace.value][parentInstanceId].groupId
    } else {
      groupId = taskId + '_' + nanoid()
    }
    taskInstances.value[activeNamespace.value][instanceId] = {
      id: instanceId,
      taskId,
      parentInstanceId: parentInstanceId || null,
      childInstanceIds: [],
      groupId,
    }

    if (parentInstanceId && taskInstances.value[activeNamespace.value][parentInstanceId]) {
      taskInstances.value[activeNamespace.value][parentInstanceId].childInstanceIds.push(instanceId)
    }

    const childTaskIds = flatTasks.value[activeNamespace.value][taskId].childrenIds
    if (childTaskIds.length > 0) {
      childTaskIds.forEach((childTaskId) => {
        createTaskInstance(childTaskId, instanceId)
      })
    }
    return instanceId
  }

  function createDefaultInstances() {
    const currentNamespace = activeNamespace.value
    if (!rootTaskIds.value[currentNamespace] || rootTaskIds.value[currentNamespace].length === 0) {
      console.error(`No root tasks found for namespace: ${currentNamespace}`)
      return
    }

    rootTaskIds.value[activeNamespace.value].forEach((taskId) => {
      createTaskInstance(taskId)
    })
  }

  function addRepeatableTaskInstance(taskId: string, parentInstanceId?: string): string {
    const task = taskById.value(taskId)
    if (!task.repeatable) return ''
    return createTaskInstance(taskId, parentInstanceId, true)
  }

  function removeRepeatableTaskInstance(instanceId: string): void {
    const instance = taskInstances.value[activeNamespace.value][instanceId]

    if (!instance) return

    const childrenToRemove = [...instance.childInstanceIds]
    childrenToRemove.forEach((childId) => {
      removeRepeatableTaskInstance(childId)
    })

    if (
      instance.parentInstanceId &&
      taskInstances.value[activeNamespace.value][instance.parentInstanceId]
    ) {
      const parent = taskInstances.value[activeNamespace.value][instance.parentInstanceId]
      parent.childInstanceIds = parent.childInstanceIds.filter((id) => id !== instanceId)
    }

    delete taskInstances.value[activeNamespace.value][instanceId]
  }

  function getInstancesForTask(taskId: string, parentInstanceId?: string): TaskInstance[] {
    return Object.values(taskInstances.value[activeNamespace.value]).filter(
      (instance) =>
        instance.taskId === taskId &&
        (parentInstanceId === undefined || instance.parentInstanceId === parentInstanceId),
    )
  }

  function getInstanceIdsForTask(taskId: string, parentInstanceId?: string): string[] {
    return getInstancesForTask(taskId, parentInstanceId).map((instance) => instance.id)
  }

  function getRootTaskInstanceIds(taskId: string): string[] {
    if (!rootTaskIds.value[activeNamespace.value].includes(taskId)) {
      throw new Error(`Task ${taskId} is not a root task.`)
    }
    return getInstanceIdsForTask(taskId)
  }

  function findRelatedInstance(
    conditionTaskId: string,
    currentInstanceId: string,
  ): TaskInstance | null {
    const currentInstance = taskInstances.value[activeNamespace.value][currentInstanceId]
    if (!currentInstance) return null

    const relatedInstance = Object.values(taskInstances.value[activeNamespace.value]).find(
      (instance) =>
        instance.taskId === conditionTaskId && instance.groupId === currentInstance.groupId,
    )
    return relatedInstance || null
  }

  function setInstanceMappingSource(instanceId: string, sourceInstanceId: string): void {
    if (taskInstances.value[activeNamespace.value][instanceId]) {
      taskInstances.value[activeNamespace.value][instanceId].mappedFromInstanceId = sourceInstanceId
    }
  }

  function setRootTask(id: string) {
    currentRootTaskId.value[activeNamespace.value] = id
  }

  function nextRootTask() {
    const currentId = parseInt(currentRootTaskId.value[activeNamespace.value], 10)
    const nextId = currentId + 1
    if (nextId < rootTaskIds.value[activeNamespace.value].length) {
      setRootTask(nextId.toString())
    }
  }

  function previousRootTask() {
    const currentId = parseInt(currentRootTaskId.value[activeNamespace.value], 10)
    const nextId = currentId - 1
    if (nextId >= 0) {
      setRootTask(nextId.toString())
    }
  }

  function toggleCompleteForTaskId(taskId: string) {
    if (!rootTaskIds.value[activeNamespace.value].includes(taskId)) {
      throw new Error(`Task with id ${taskId} is not a root task`)
    }
    if (completedRootTaskIds.value[activeNamespace.value].has(taskId)) {
      completedRootTaskIds.value[activeNamespace.value].delete(taskId)
    } else {
      completedRootTaskIds.value[activeNamespace.value].add(taskId)
    }
  }

  function isRootTaskCompleted(taskId: string): boolean {
    return completedRootTaskIds.value[activeNamespace.value].has(taskId)
  }

  /**
   * ==============================================
   * Store getters
   * ==============================================
   */
  const taskById = computed(() => {
    return (taskId: string): FlatTask => {
      const task = flatTasks.value[activeNamespace.value][taskId]

      if (!task) {
        throw new Error(`Task with id ${taskId} not found`)
      }

      return task
    }
  })

  const getRootTasks = computed(() => {
    return rootTaskIds.value[activeNamespace.value].map(
      (id) => flatTasks.value[activeNamespace.value][id],
    )
  })

  const getParentTaskId = computed(() => {
    return (taskId: string): string | null => {
      return flatTasks.value[activeNamespace.value][taskId]?.parentId || null
    }
  })

  const getChildTaskIds = computed(() => {
    return (taskId: string): string[] => {
      return flatTasks.value[activeNamespace.value][taskId]?.childrenIds || []
    }
  })

  const getInstanceById = computed(() => {
    return (instanceId: string): TaskInstance | null => {
      return taskInstances.value[activeNamespace.value][instanceId] || null
    }
  })

  return {
    // Properties
    activeNamespace,
    flatTasks,
    taskInstances,
    currentRootTaskId,
    rootTaskIds,
    completedRootTaskIds,
    isInitialized,

    // Actions
    init,
    getNamespacedState,
    setActiveNamespace,
    addRepeatableTaskInstance,
    removeRepeatableTaskInstance,
    getInstancesForTask,
    getInstanceIdsForTask,
    getRootTaskInstanceIds,
    findRelatedInstance,
    setInstanceMappingSource,
    setRootTask,
    nextRootTask,
    previousRootTask,
    toggleCompleteForTaskId,
    isRootTaskCompleted,

    // Getters
    taskById,
    getRootTasks,
    getParentTaskId,
    getChildTaskIds,
    getInstanceById,
  }
})

export type TaskStoreType = ReturnType<typeof useTaskStore>

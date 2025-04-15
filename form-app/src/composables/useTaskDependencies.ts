import { useAnswerStore } from '@/stores/answers'
import { useTaskStore, type FlatTask, type TaskInstance } from '@/stores/tasks'
import { shouldShowTask as checkShouldShowTask, hasInstanceMapping } from '@/utils/dependency'
import { computed } from 'vue'

export function useTaskDependencies() {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const shouldShowTask = computed(() => {
    return (taskId: string, instanceId: string): boolean => {
      return checkShouldShowTask(taskId, instanceId, taskStore, answerStore)
    }
  })

  const hasDependencyOfType = computed(() => {
    return (task: FlatTask, dependency: string): boolean => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return false
      }
      return task.dependencies.some(dep => dep.type === dependency)
    }
  })

  const getDependencySourceTaskId = computed(() => {
    return (task: FlatTask): string | null => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return null
      }

      for (const dependency of task.dependencies) {
        if (dependency.type === "source_options" && dependency.condition) {
          return dependency.condition.id
        }
        else if (dependency.type === "instance_mapping" && dependency.source) {
          return dependency.source.id
        }
        else if (dependency.type === "conditional" && dependency.condition) {
          return dependency.condition.id
        }
        else {
          throw new Error(`got an unsupported dependency type ${dependency.type}`)
        }
      }

      return null
    }
  })

  const getSourceOptions = computed(() => {
    return (task: FlatTask): string[] => {
      if (!hasDependencyOfType.value(task, "source_options")) return []

      const sourceTaskId = getDependencySourceTaskId.value(task)
      if (sourceTaskId === null) return []

      const uniqueValues = new Set<string>()
      const sourceInstanceIds = taskStore.getInstanceIdsForTask(sourceTaskId)

      sourceInstanceIds.forEach((instanceId) => {
        const answer = answerStore.getAnswer(instanceId)
        if (typeof answer === 'string' && answer !== '') {
          uniqueValues.add(answer)
        }
      })

      return Array.from(uniqueValues)
    }
  })

  const hasSourceTaskValues = computed(() => {
    return (task: FlatTask): { hasValues: boolean; sourceId: string | null } => {
      const sourceTaskId = getDependencySourceTaskId.value(task)

      if (!sourceTaskId) {
        return { hasValues: true, sourceId: null }
      }

      const sourceInstances = taskStore.getInstancesForTask(sourceTaskId)

      const hasAnyValue = sourceInstances.some(instance => {
        const answer = answerStore.getAnswer(instance.id)
        return answer !== null && answer !== '' && answer !== undefined
      })

      return {
        hasValues: hasAnyValue,
        sourceId: sourceTaskId
      }
    }
  })

  const canUserCreateInstances = computed(() => {
    return (taskId: string): boolean => {
      const task = taskStore.taskById(taskId)
      if (!task.repeatable) return false
      return !hasInstanceMapping(task)
    }
  })

  const syncInstances = computed(() => {
    return (): void => {
      const namespace = taskStore.activeNamespace
      Object.entries(taskStore.flatTasks[namespace]).forEach(([taskId, task]) => {
        const mappingDeps = task.dependencies?.filter((d) => d.type === 'instance_mapping') || []

        if (mappingDeps.length === 0) return

        for (const dep of mappingDeps) {
          const sourceId = dep.source?.id
          if (!sourceId) continue

          const sourceInstances = taskStore.getInstancesForTask(sourceId)
          const targetInstances = taskStore.getInstancesForTask(taskId)

          const targetInstancesBySourceId = new Map<string, TaskInstance>()
          targetInstances.forEach((instance) => {
            if (instance.mappedFromInstanceId) {
              targetInstancesBySourceId.set(instance.mappedFromInstanceId, instance)
            } else {
              instance.mappedFromInstanceId = sourceInstances[0].id
              targetInstancesBySourceId.set(instance.mappedFromInstanceId, instance)
            }
          })

          sourceInstances.forEach((sourceInstance) => {
            const existingTarget = targetInstancesBySourceId.get(sourceInstance.id)

            if (!existingTarget) {
              const newInstanceId = taskStore.addRepeatableTaskInstance(taskId)

              if (newInstanceId) {
                taskStore.setInstanceMappingSource(newInstanceId, sourceInstance.id)
              } else {
              }
            } else {
              targetInstancesBySourceId.delete(sourceInstance.id)
            }
          })
          targetInstancesBySourceId.forEach((instance) => {
            taskStore.removeRepeatableTaskInstance(instance.id)
          })
        }
      })
    }
  })

  return {
    shouldShowTask,
    hasSourceTaskValues,
    getDependencySourceTaskId,
    canUserCreateInstances,
    getSourceOptions,
    syncInstances,
  }
}

import { useAnswerStore, type AnswerValue } from '@/stores/answers'
import { useTaskStore, type FlatTask, type TaskInstance } from '@/stores/tasks'
import { computed } from 'vue'

function normalizeValue(value: string): string | boolean | null {
  if (value.toLowerCase() === 'true') {
    return true
  } else if (value.toLowerCase() === 'false') {
    return false
  } else if (value === 'null' || value === '') {
    return null
  }
  return value
}

export function useTaskDependencies() {
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  const shouldShowTask = computed(() => {
    return (taskId: string, instanceId: string): boolean => {
      const task = taskStore.taskById(taskId)
      const instance = taskStore.getInstanceById(instanceId)

      // If there are no dependencies, dependencies are void or there is no instance
      // we should show task.
      if (!task.dependencies || task.dependencies.length === 0 || !instance) {
        return true
      }

      for (const dependency of task.dependencies) {
        if (dependency.type == 'conditional') {
          // If the condition is void we should show task.
          if (!dependency.condition) {
            return true
          }

          const { id: conditionTaskId, operator, value } = dependency.condition
          const action = dependency.action

          // NOTE: We assume the conditionTaskId is within the same task group, i.e. we
          // assume that the conditionTaskId is an ancestor of taskId.
          const relatedInstance = taskStore.findRelatedInstance(conditionTaskId, instanceId)
          if (!relatedInstance) {
            continue
          }

          const conditionValue = answerStore.getAnswer(relatedInstance.id)

          // We need to parse the conditionValue if it is a string.
          let normalizedValue: AnswerValue | boolean = conditionValue
          if (typeof conditionValue === 'string') {
            normalizedValue = normalizeValue(conditionValue)
          }

          let conditionMet = false
          if (operator === 'equals') {
            conditionMet = normalizedValue === value
          } else {
            // Add more operators if needed.
            throw new Error(`got an unsuported operator ${operator}`)
          }

          // If the action is 'show' and the condition is non-void and is not met,
          // we should not show task.
          if (action === 'show' && !conditionMet) {
            return false
          }
        }
      }

      // We exhausted all possibilities of to not show task, so we should show task.
      return true
    }
  })

  const getSourceOptions = computed(() => {
    return (task: FlatTask): string[] => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return []
      }

      for (const dependency of task.dependencies) {
        if (dependency.type === 'source_options') {
          if (!dependency.condition) {
            return []
          }
          const { id: sourceTaskId } = dependency.condition

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
      }
      return []
    }
  })

  const canUserCreateInstances = computed(() => {
    return (taskId: string): boolean => {
      const task = taskStore.taskById(taskId)

      if (!task.repeatable) return false

      const hasInstanceMapping =
        task.dependencies?.some((dep) => dep.type === 'instance_mapping') || false
      return !hasInstanceMapping
    }
  })

  const syncInstances = computed(() => {
    return (): void => {
      Object.entries(taskStore.flatTasks).forEach(([taskId, task]) => {
        const mappingDeps = task.dependencies?.filter((d) => d.type === 'instance_mapping') || []

        if (mappingDeps.length === 0) return

        for (const dep of mappingDeps) {
          const sourceId = dep.source?.id
          if (!sourceId) continue

          const sourceInstances = taskStore.getInstancesForTask(sourceId)
          const targetInstances = taskStore.getInstancesForTask(taskId)

          const targetInstancesBySourceId = new Map<string, TaskInstance>()
          targetInstances.forEach(instance => {
            if (instance.mappedFromInstanceId) {
              targetInstancesBySourceId.set(instance.mappedFromInstanceId, instance)
            } else {
              instance.mappedFromInstanceId = sourceInstances[0].id
              targetInstancesBySourceId.set(instance.mappedFromInstanceId, instance)
            }
          })

          sourceInstances.forEach(sourceInstance => {
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
    canUserCreateInstances,
    getSourceOptions,
    syncInstances,
  }
}

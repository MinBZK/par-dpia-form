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
      return !hasInstanceMapping(task)
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

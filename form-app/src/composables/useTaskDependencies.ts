import { computed } from 'vue'
import { useTaskStore, type FlatTask } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'

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
    return (taskId: string, instance: number): boolean => {
      const task = taskStore.taskById(taskId)

      if (!task.dependencies || task.dependencies.length === 0) {
        return true
      }

      for (const dependency of task.dependencies) {
        if (dependency.type == "conditional") {
          if (!dependency.condition) {
            return true
          }

          const { id, operator, value } = dependency.condition
          const action = dependency.action

          const conditionValue = answerStore.answers[id]?.[instance]?.value
          let normalizedValue = null
          if (typeof conditionValue === 'string') {
            normalizedValue = normalizeValue(conditionValue)
          } else {
            normalizedValue = conditionValue
          }

          let conditionMet = false
          if (operator === 'equals') {
            conditionMet = normalizedValue === value
          }
          // Add more operators if needed.
          if (action === 'show' && !conditionMet) {
            return false
          }
        }
      }
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
          const { id } = dependency.condition


          const uniqueValues = new Set<string>()

          if (answerStore.answers[id]) {
            Object.values(answerStore.answers[id]).forEach(answer => {
              if (typeof answer.value === 'string' && answer.value !== '') {
                uniqueValues.add(answer.value)
              }
            })
          }

          return Array.from(uniqueValues)
        }
      }
      return []
    }
  })

  const syncInstances = computed(() => {
    return (): void => {
      Object.keys(taskStore.flatTasks).forEach(taskId => {
        const task = taskStore.taskById(taskId)

        const mappingDeps = task.dependencies?.filter(d => d.type === 'instance_mapping') || []

        for (const dep of mappingDeps) {
          const sourceId = dep.source?.id
          if (sourceId) {
            const sourceValues = Object.values(answerStore.answers[sourceId] || {})

            if (sourceValues.length >= 0) {
              taskStore.syncInstancesFromSource(taskId, sourceValues.length)
            }

          }
        }
      })
    }
  })

  return {
    shouldShowTask,
    getSourceOptions,
    syncInstances,
  }
}

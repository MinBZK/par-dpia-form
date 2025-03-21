import { computed } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'

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
          const { id, operator, value } = dependency.condition
          const action = dependency.action

          const conditionValue = answerStore.answers[id]?.[instance]?.value

          let conditionMet = false
          if (operator === 'equals') {
            conditionMet = conditionValue === value
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

  return {
    shouldShowTask,
  }
}

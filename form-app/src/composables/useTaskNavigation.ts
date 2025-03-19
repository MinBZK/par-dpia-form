import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '@/stores/tasks'

export function useTaskNavigation() {
  const taskStore = useTaskStore()
  const { currentRootTaskId } = storeToRefs(taskStore)
  const rootTasks = computed(() => taskStore.getRootTasks)

  const goToNext = () => {
    taskStore.nextRootTask()
    scrollToTop()
  }

  const goToPrevious = () => {
    taskStore.previousRootTask()
    scrollToTop()
  }

  const goToTask = (taskId: string) => {
    taskStore.setRootTask(taskId)
    scrollToTop()
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const isFirstTask = computed(() => currentRootTaskId.value === rootTasks.value[0]?.id)

  const isLastTask = computed(() => {
    const lastIndex = rootTasks.value.length - 1
    return currentRootTaskId.value === rootTasks.value[lastIndex]?.id
  })

  return {
    currentRootTaskId,
    rootTasks,
    goToNext,
    goToPrevious,
    goToTask,
    isFirstTask,
    isLastTask
  }
}

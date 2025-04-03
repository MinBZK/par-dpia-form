import { useAnswerStore } from '@/stores/answers'
import { useTaskStore } from '@/stores/tasks'
import { type DPIASnapshot } from '@/models/dpiaSnapshot'
import { onMounted, watch } from 'vue'

export function useAppStatePersistence() {
  const APP_STATE_KEY = 'dpia_app_state'

  const answerStore = useAnswerStore()
  const taskStore = useTaskStore()

  function saveAppState(): void {
    try {
      const dpiaSnapshot: DPIASnapshot = {
        metadata: {
          savedAt: new Date().toISOString(),
        },

        taskState: {
          currentRootTaskId: taskStore.currentRootTaskId,
          taskInstances: taskStore.taskInstances,
          completedRootTaskIds: Array.from(taskStore.completedRootTaskIds),
        },
        answers: answerStore.answers,
      }

      localStorage.setItem(APP_STATE_KEY, JSON.stringify(dpiaSnapshot))

    } catch (error) {
      console.error('Failed to save app state to local storage:', error)
    }
  }

  function loadAppState(): DPIASnapshot | null {
    try {
      const dpiaSnapshotData = localStorage.getItem(APP_STATE_KEY)

      if (dpiaSnapshotData) {
        return JSON.parse(dpiaSnapshotData)
      }
    } catch (error) {
      console.error('Failed to load app state to local storage:', error)
    }
    return null
  }

  function applyAppState(snapshot: DPIASnapshot): void {
    if (snapshot.taskState) {
      taskStore.currentRootTaskId = snapshot.taskState.currentRootTaskId

      taskStore.taskInstances = {}
      Object.assign(taskStore.taskInstances, snapshot.taskState.taskInstances)

      taskStore.completedRootTaskIds = new Set(snapshot.taskState.completedRootTaskIds)
    }

    if (snapshot.answers) {
      answerStore.answers = {}
      Object.assign(answerStore.answers, snapshot.answers)
    }
  }

  function setupWatchers() {
    watch(
      [
        () => taskStore.currentRootTaskId,
        () => taskStore.taskInstances,
        () => answerStore.answers,
      ],
      () => {
        if (taskStore.isInitialized) {
          saveAppState()
        }
      },
      { deep: true }
    )
  }

  return {
    saveAppState,
    loadAppState,
    applyAppState,
    setupWatchers,
  }
}

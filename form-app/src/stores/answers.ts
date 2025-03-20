import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type AnswerValue = string | string[] | number | null;

export interface Answer {
  value: AnswerValue;
  timestamp: string;
}

const LOCAL_STORAGE_KEY = 'dpia_form_answers'

const _loadSavedAnswers = (): Record<string, Record<number, Answer>> => {
  try {
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedData) {
      return JSON.parse(savedData)
    }
  } catch (error) {
    console.error('Failed to load saved answers:', error)
  }
  return {}
}

export const useAnswerStore = defineStore('AnswerStore', () => {

  // Properties
  const answers = ref<Record<string, Record<number, Answer>>>(_loadSavedAnswers())

  // Actions
  function setAnswer(taskId: string, instance: number, value: AnswerValue): void {
    const answer: Answer = {
      value,
      timestamp: new Date().toISOString()
    }
    if (!answers.value[taskId]) {
      answers.value[taskId] = {}
    }
    answers.value[taskId][instance] = answer
  }


  function removeAnswer(taskId: string, instance: number): void {
    if (!taskId || instance === undefined) return

    // Find all child task IDs that start with the parent taskId
    const childTaskIds = Object.keys(answers.value).filter(id =>
      id.startsWith(`${taskId}.`) || id === taskId
    )

    // Remove the specified instance for each child task
    childTaskIds.forEach(childId => {
      if (answers.value[childId] && answers.value[childId][instance]) {
        delete answers.value[childId][instance];

        // Clean up empty task objects
        if (Object.keys(answers.value[childId]).length === 0) {
          delete answers.value[childId];
        }
      }
    })
  }

  function saveToLocalStorage() {
    try {
      // TODO: Handle file inputs
      const serializableAnswers = JSON.parse(JSON.stringify(answers.value))
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serializableAnswers))
    } catch (error) {
      console.error('Failed to save answers:', error)
    }
  }

  watch(answers, () => {
    saveToLocalStorage()
  }, { deep: true })

  return {
    // Properties
    answers,

    // Actions
    setAnswer,
    removeAnswer,
  }
})

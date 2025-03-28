import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const LOCAL_STORAGE_KEY = 'dpia_form_answers'

export type AnswerValue = string | string[] | boolean | number | null

export interface Answer {
  value: AnswerValue
  timestamp: string
}

export const useAnswerStore = defineStore('AnswerStore', () => {
  /**
   * ==============================================
   * Store properties
   * ==============================================
   */
  const answers = ref<Record<string, Answer>>({})

  /**
   * ==============================================
   * Store actions
   * ==============================================
   */
  function setAnswer(instanceId: string, value: AnswerValue): void {
    const answer: Answer = {
      value,
      timestamp: new Date().toISOString(),
    }
    answers.value[instanceId] = answer
  }

  function getAnswer(instanceId: string): AnswerValue | null {
    return answers.value[instanceId]?.value || null
  }

  function removeAnswer(instanceId: string): void {
    if (instanceId in answers.value) {
      delete answers.value[instanceId]
    }
  }

  function removeAnswerForInstances(instanceIds: string[]): void {
    instanceIds.forEach((id) => removeAnswer(id))
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(answers.value))
    } catch (error) {
      console.error('Failed to save answers:', error)
    }
  }

  watch(
    answers,
    () => {
      saveToLocalStorage()
    },
    { deep: true },
  )

  return {
    // Properties
    answers,

    // Actions
    setAnswer,
    getAnswer,
    removeAnswer,
    removeAnswerForInstances,
  }
})

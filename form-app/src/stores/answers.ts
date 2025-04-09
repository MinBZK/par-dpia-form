import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AnswerValue = string | string[] | null

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

export type AnswerStoreType = ReturnType<typeof useAnswerStore>

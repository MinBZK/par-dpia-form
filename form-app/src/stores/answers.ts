import { defineStore } from 'pinia'
import { ref } from 'vue'
import { FormType } from '@/models/dpia.ts';

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
  const activeNamespace = ref(FormType.DPIA)
  const answers = ref<Record<FormType, Record<string, Answer>>>({
    [FormType.DPIA]: {},
    [FormType.PRE_SCAN]: {},
    [FormType.IAMA]: {},
  })

  /**
   * ==============================================
   * Store actions
   * ==============================================
   */

  function setActiveNamespace(namespace: FormType) {
    if (activeNamespace.value !== namespace) {
      activeNamespace.value = namespace

      // Initialize namespace if it doesn't exist
      if (!answers.value[namespace]) {
        answers.value[namespace] = {}
      }
    }
  }

  function setAnswer(instanceId: string, value: AnswerValue): void {
    const answer: Answer = {
      value,
      timestamp: new Date().toISOString(),
    }
    answers.value[activeNamespace.value][instanceId] = answer
  }

  function getAnswer(instanceId: string): AnswerValue | null {
    return answers.value[activeNamespace.value][instanceId]?.value || null
  }

  function getAnswerFromNamespace(namespace: FormType, instanceId: string): AnswerValue | null {
    if (!answers.value[namespace] || !answers.value[namespace][instanceId]) {
      return null;
    }
    return answers.value[namespace][instanceId]?.value || null;
  }

  function removeAnswer(instanceId: string): void {
    if (instanceId in answers.value) {
      delete answers.value[activeNamespace.value][instanceId]
    }
  }

  function removeAnswerForInstances(instanceIds: string[]): void {
    instanceIds.forEach((id) => removeAnswer(id))
  }

  return {
    // Properties
    activeNamespace,
    answers,

    // Actions
    setActiveNamespace,
    setAnswer,
    getAnswer,
    getAnswerFromNamespace,
    removeAnswer,
    removeAnswerForInstances,
  }
})

export type AnswerStoreType = ReturnType<typeof useAnswerStore>

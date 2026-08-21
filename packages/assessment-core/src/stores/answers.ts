import { defineStore } from 'pinia'
import { ref } from 'vue'
import { FormType } from '../models/dpia'

// Same formats, order and case-sensitivity as ALLOWED_IMAGE_DATA in the backend
// validator: anything this accepts must survive the server-side check on save.
const RASTER_DATA_URI = /^data:image\/(webp|png|jpe?g|gif);base64,/

export type ImageValue = {
  data: string
  title?: string
  description?: string
  source?: string
}

export function isImageValue(value: unknown): value is ImageValue {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('data' in value) ||
    typeof (value as Record<string, unknown>).data !== 'string'
  ) return false
  const data = (value as Record<string, unknown>).data as string
  // Raster data URIs only, as a positive allowlist. The old negative check
  // (`!startsWith('data:image/svg')`) was case-sensitive while media types are
  // not, so `data:image/SVG+xml` passed it. Uploads are rasterised to WebP, but
  // a JSON import skips that path entirely.
  return RASTER_DATA_URI.test(data)
}

export type AnswerValue = string | string[] | ImageValue | null

export interface Answer {
  value: AnswerValue
  lastEditedAt: string
  lastEditedBy?: string
}

export const useAnswerStore = defineStore('AnswerStore', () => {
  /**
   * ==============================================
   * Store properties
   * ==============================================
   */
  const activeNamespace = ref(FormType.DPIA)
  const answers = ref<Record<FormType, Record<string, Answer>>>({
    [FormType.PRE_SCAN]: {},
    [FormType.DPIA]: {},
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
      lastEditedAt: new Date().toISOString(),
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
    delete answers.value[activeNamespace.value][instanceId]
  }

  function removeAnswerForInstances(instanceIds: string[]): void {
    instanceIds.forEach((id) => removeAnswer(id))
  }

  function reset() {
    activeNamespace.value = FormType.DPIA
    answers.value = {
      [FormType.PRE_SCAN]: {},
      [FormType.DPIA]: {},
      [FormType.IAMA]: {},
    }
  }

  return {
    // Properties
    activeNamespace,
    answers,

    // Actions
    reset,
    setActiveNamespace,
    setAnswer,
    getAnswer,
    getAnswerFromNamespace,
    removeAnswer,
    removeAnswerForInstances,
  }
})

export type AnswerStoreType = ReturnType<typeof useAnswerStore>

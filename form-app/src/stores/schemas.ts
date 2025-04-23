// src/stores/schemaStore.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DPIA } from '@/models/dpia.ts'
import * as t from 'io-ts'
import { isRight } from 'fp-ts/lib/Either'
import { createSigningTask } from '@/utils/taskUtils'

// Import JSON files
import dpia_json from '@/assets/DPIA.json'
import pre_dpia_json from '@/assets/PreScanDPIA.json'

export const useSchemaStore = defineStore('SchemaStore', () => {
  const validatedDpia = ref<t.TypeOf<typeof DPIA> | null>(null)
  const validatedPreScan = ref<t.TypeOf<typeof DPIA> | null>(null)
  const isInitialized = ref(false)
  const hasErrors = ref(false)
  const errorMessage = ref<string | null>(null)

  function processSchema(
    jsonData: unknown,
    schemaType: 'dpia' | 'prescan'
  ): boolean {
    try {
      const validation = DPIA.decode(jsonData as any)

      if (isRight(validation)) {
        const validData = validation.right

        // Add signing task if needed
        const hasSigningTask = validData.tasks.some(task =>
          task.type && task.type.includes('signing')
        )
        if (!hasSigningTask) {
          validData.tasks.push(createSigningTask(validData.tasks.length.toString()))
        }

        // Store in the appropriate ref
        if (schemaType === 'dpia') {
          validatedDpia.value = validData
        } else if (schemaType === 'prescan') {
          validatedPreScan.value = validData
        }

        return true
      } else {
        // Validation failed
        const errors = validation.left
        const errorLocations = errors.map(err =>
          err.context.map(c => c.key).join('.')
        )

        const errorMsg = `JSON schema validation failed at: ${errorLocations.join(', ')}`
        console.error(errorMsg)
        hasErrors.value = true
        errorMessage.value = errorMsg

        return false
      }
    } catch (error) {
      console.error("Unexpected error during schema processing:", error)
      hasErrors.value = true
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  function init() {
    if (isInitialized.value) return

    // Reset error state
    hasErrors.value = false
    errorMessage.value = null

    const dpiaSuccess = processSchema(dpia_json, 'dpia')
    const preScanSuccess = processSchema(pre_dpia_json, 'prescan')

    // Mark as initialized if at least one schema processed successfully
    isInitialized.value = dpiaSuccess || preScanSuccess
  }

  function getSchema(namespace: 'dpia' | 'prescan') {
    if (namespace === 'dpia') return validatedDpia.value
    if (namespace === 'prescan') return validatedPreScan.value
  }

  return {
    isInitialized,
    hasErrors,
    errorMessage,
    init,
    getSchema
  }
})

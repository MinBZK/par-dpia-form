import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DPIA, FormType } from '../models/dpia'
import * as t from 'io-ts'
import { isRight } from 'fp-ts/lib/Either'
import { createConclusionTask } from '../utils/taskUtils'

// Shared "Afronding" description for the DPIA and IAMA conclusion steps.
const AFRONDING_DESCRIPTION =
  'Zorg dat alle stappen als voltooid gemarkeerd zijn, zodat het formulier compleet is. Als je nog niet klaar bent, kun je het formulier ook opslaan en later weer verder gaan. Indien je klaar bent, kun je het formulier als PDF exporteren.'

export const useSchemaStore = defineStore('SchemaStore', () => {
  const validatedDpia = ref<t.TypeOf<typeof DPIA> | null>(null)
  const validatedPreScan = ref<t.TypeOf<typeof DPIA> | null>(null)
  const validatedIama = ref<t.TypeOf<typeof DPIA> | null>(null)
  const isInitialized = ref(false)
  const hasErrors = ref(false)
  const errorMessage = ref<string | null>(null)

  function processSchema(
    jsonData: unknown,
    schemaType: FormType
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
          if (schemaType === FormType.DPIA) {
            validData.tasks.push(createConclusionTask("Afronding", validData.tasks.length.toString(), AFRONDING_DESCRIPTION))
          } else if (schemaType === FormType.IAMA) {
            validData.tasks.push(createConclusionTask("Afronding", validData.tasks.length.toString(), AFRONDING_DESCRIPTION, true))
          } else {
            validData.tasks.push(createConclusionTask("Resultaat pre-scan", validData.tasks.length.toString()))
          }
        }

        // Store in the appropriate ref
        if (schemaType === FormType.DPIA) {
          validatedDpia.value = validData
        } else if (schemaType === FormType.IAMA) {
          validatedIama.value = validData
        } else {
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

  function init(schemas: { dpia: unknown; preScan: unknown; iama: unknown }) {
    if (isInitialized.value) return

    // Reset error state
    hasErrors.value = false
    errorMessage.value = null

    const dpiaSuccess = processSchema(schemas.dpia, FormType.DPIA)
    const preScanSuccess = processSchema(schemas.preScan, FormType.PRE_SCAN)
    const iamaSuccess = processSchema(schemas.iama, FormType.IAMA)

    // Mark as initialized if at least one schema processed successfully
    isInitialized.value = dpiaSuccess || preScanSuccess || iamaSuccess
  }

  function getSchema(namespace: FormType): t.TypeOf<typeof DPIA> | null {
    if (namespace === FormType.DPIA) return validatedDpia.value
    if (namespace === FormType.PRE_SCAN) return validatedPreScan.value
    if (namespace === FormType.IAMA) return validatedIama.value
    return null
  }

  function getUrn(namespace: FormType): string {
    const schema = getSchema(namespace)
    if (!schema) throw new Error(`Schema not loaded for namespace: ${namespace}`)
    return `${schema.urn}:${schema.version}`
  }

  return {
    isInitialized,
    hasErrors,
    errorMessage,
    init,
    getSchema,
    getUrn
  }
})

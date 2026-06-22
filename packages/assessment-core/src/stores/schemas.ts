import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DPIA, FormType } from '../models/dpia'
import * as t from 'io-ts'
import { isRight } from 'fp-ts/lib/Either'
import { createConclusionTask } from '../utils/taskUtils'
import { canonicalVersion } from '../versioning/semver'
import { namespaceFromUrn } from '../utils/importDetect'

// Shared "Afronding" description for the DPIA and IAMA conclusion steps.
const AFRONDING_DESCRIPTION =
  'Zorg dat alle stappen als voltooid gemarkeerd zijn, zodat het formulier compleet is. Als je nog niet klaar bent, kun je het formulier ook opslaan en later weer verder gaan. Indien je klaar bent, kun je het formulier als PDF exporteren.'

type ValidatedDefinition = t.TypeOf<typeof DPIA>

export const useSchemaStore = defineStore('SchemaStore', () => {
  const validatedDpia = ref<ValidatedDefinition | null>(null)
  const validatedPreScan = ref<ValidatedDefinition | null>(null)
  const validatedIama = ref<ValidatedDefinition | null>(null)
  const isInitialized = ref(false)
  const hasErrors = ref(false)
  const errorMessage = ref<string | null>(null)
  // Definitions keyed by their canonical urn (official coarse MAJOR.MINOR, concept full —
  // the same form getUrn stamps), so getByUrn(getUrn(ns)) resolves and a specific version
  // can be looked up independent of the active-per-type view.
  const registry = ref(new Map<string, ValidatedDefinition>())

  // Decode a raw definition and append its conclusion task. Returns the validated
  // definition, or null after recording the validation error.
  function validateAndAugment(jsonData: unknown, schemaType: FormType): ValidatedDefinition | null {
    try {
      const validation = DPIA.decode(jsonData as any)

      if (isRight(validation)) {
        const validData = validation.right

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

        return validData
      }

      const errors = validation.left
      const errorLocations = errors.map(err =>
        err.context.map(c => c.key).join('.')
      )
      const errorMsg = `JSON schema validation failed at: ${errorLocations.join(', ')}`
      console.error(errorMsg)
      hasErrors.value = true
      errorMessage.value = errorMsg
      return null
    } catch (error) {
      console.error("Unexpected error during schema processing:", error)
      hasErrors.value = true
      errorMessage.value = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  function processSchema(jsonData: unknown, schemaType: FormType): boolean {
    const validData = validateAndAugment(jsonData, schemaType)
    if (!validData) return false

    if (schemaType === FormType.DPIA) {
      validatedDpia.value = validData
    } else if (schemaType === FormType.IAMA) {
      validatedIama.value = validData
    } else {
      validatedPreScan.value = validData
    }
    registry.value.set(`${validData.urn}:${canonicalVersion(validData.version)}`, validData)
    return true
  }

  function init(schemas: { preScan: unknown; dpia: unknown; iama: unknown }) {
    if (isInitialized.value) return

    // Reset error state
    hasErrors.value = false
    errorMessage.value = null

    const preScanSuccess = processSchema(schemas.preScan, FormType.PRE_SCAN)
    const dpiaSuccess = processSchema(schemas.dpia, FormType.DPIA)
    const iamaSuccess = processSchema(schemas.iama, FormType.IAMA)

    // Mark as initialized if at least one schema processed successfully
    isInitialized.value = preScanSuccess || dpiaSuccess || iamaSuccess
  }

  // Register an additional definition version into the registry (does not touch the
  // active-per-type view). The assessment type is derived from the urn prefix.
  function register(jsonData: unknown): boolean {
    const rawUrn = (jsonData as { urn?: unknown } | null)?.urn
    const schemaType = namespaceFromUrn(typeof rawUrn === 'string' ? rawUrn : undefined)
    if (!schemaType) {
      hasErrors.value = true
      errorMessage.value = 'Cannot register definition: unknown or missing urn'
      return false
    }
    const validData = validateAndAugment(jsonData, schemaType)
    if (!validData) return false
    registry.value.set(`${validData.urn}:${canonicalVersion(validData.version)}`, validData)
    return true
  }

  // Look up a registered definition by its canonical urn (the form getUrn stamps).
  function getByUrn(urn: string): ValidatedDefinition | null {
    return registry.value.get(urn) ?? null
  }

  function registeredUrns(): string[] {
    return Array.from(registry.value.keys())
  }

  function getSchema(namespace: FormType): ValidatedDefinition | null {
    if (namespace === FormType.DPIA) return validatedDpia.value
    if (namespace === FormType.PRE_SCAN) return validatedPreScan.value
    if (namespace === FormType.IAMA) return validatedIama.value
    return null
  }

  function getUrn(namespace: FormType): string {
    const schema = getSchema(namespace)
    if (!schema) throw new Error(`Schema not loaded for namespace: ${namespace}`)
    // D1: official -> coarse MAJOR.MINOR, concept -> full identifier. Same canonical form
    // as the registry key, so getByUrn(getUrn(ns)) round-trips.
    return `${schema.urn}:${canonicalVersion(schema.version)}`
  }

  function setActiveSlot(namespace: FormType, definition: ValidatedDefinition) {
    if (namespace === FormType.DPIA) validatedDpia.value = definition
    else if (namespace === FormType.IAMA) validatedIama.value = definition
    else validatedPreScan.value = definition
  }

  // Resolve a per-assessment version pin into the active-per-type slot, so that all
  // downstream consumers (getSchema/getUrn, task structure, save/export) work against the
  // pinned definition rather than the bundled latest. A null pin keeps the loaded latest.
  // When the pinned version is not bundled, the loaded latest is kept and `fellBack` is set
  // so the caller can warn — the pin is never silently restamped to the wrong version.
  function activatePin(namespace: FormType, pinnedVersion: string | null): { fellBack: boolean } {
    const active = getSchema(namespace)
    if (!active) throw new Error(`Schema not loaded for namespace: ${namespace}`)
    if (!pinnedVersion) return { fellBack: false }

    const pinned = registry.value.get(`${active.urn}:${canonicalVersion(pinnedVersion)}`)
    if (!pinned) return { fellBack: true }

    setActiveSlot(namespace, pinned)
    return { fellBack: false }
  }

  return {
    isInitialized,
    hasErrors,
    errorMessage,
    init,
    register,
    getByUrn,
    registeredUrns,
    getSchema,
    getUrn,
    activatePin
  }
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsDefault from 'ajv-formats'

// ajv-formats ships as CJS (module.exports = fn); under nodenext the default
// import resolves to the module namespace type, so cast to the plugin fn it
// actually is at runtime.
const addFormats = addFormatsDefault as unknown as (ajv: Ajv2020) => void

// The schema is the single source of truth at the repo root, read at startup and
// resolved relative to this module so dev, tests and the production build agree.
const schemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../schemas/assessment-output.v2.schema.json',
)
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))

// Fail-fast (not allErrors): allErrors lets a malformed payload enumerate thousands
// of errors, blocking the event loop and bloating the log line.
const ajv = new Ajv2020()
addFormats(ajv)
const validate = ajv.compile(schema)

export interface StateValidationResult {
  valid: boolean
  /** Human-readable validation errors for server-side logging (empty when valid). */
  errors: string
}

export function validateState(state: unknown): StateValidationResult {
  if (validate(state)) {
    return { valid: true, errors: '' }
  }
  return { valid: false, errors: ajv.errorsText(validate.errors) }
}

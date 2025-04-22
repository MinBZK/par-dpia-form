import { fold } from 'fp-ts/lib/Either'
import * as t from 'io-ts'

const handleValidationErrors = (errors: t.Errors): never => {
  const errorLocations = errors.map((err) => err.context.map((c) => c.key).join('.'))
  errorLocations.forEach((location) => console.error(`Error at: ${location}`))
  throw new Error(
    `JSON decoder could not validate data, problem(s) found at ${errorLocations.join(', ')}`,
  )
}

export const validateData = <T>(
  validation: t.Validation<T>,
  onSuccess: (data: T) => void,
): void => {
  fold(handleValidationErrors, onSuccess)(validation)
}

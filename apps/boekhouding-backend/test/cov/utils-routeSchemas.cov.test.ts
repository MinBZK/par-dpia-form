import { describe, it, expect } from 'vitest'
import type { FastifySchemaValidationError } from 'fastify/types/schema.js'
import { dutchSchemaErrorFormatter } from '../../src/utils/routeSchemas.js'

function error(instancePath: string): FastifySchemaValidationError {
  return { keyword: 'type', instancePath, schemaPath: '#/type', params: {} }
}

describe('dutchSchemaErrorFormatter', () => {
  it('names the offending field for a known scope', () => {
    expect(dutchSchemaErrorFormatter([error('/name')], 'body').message)
      .toBe("Ongeldige verzoekgegevens: veld 'name' is ongeldig")
  })

  it('omits the field when the error is on the object itself (missing property)', () => {
    expect(dutchSchemaErrorFormatter([error('')], 'params').message)
      .toBe('Ongeldige padparameters')
  })

  it('translates the querystring scope', () => {
    expect(dutchSchemaErrorFormatter([error('/since')], 'querystring').message)
      .toBe("Ongeldige queryparameters: veld 'since' is ongeldig")
  })

  it('falls back to the raw scope name for an unmapped data source', () => {
    expect(dutchSchemaErrorFormatter([error('')], 'cookies').message)
      .toBe('Ongeldige cookies')
  })
})

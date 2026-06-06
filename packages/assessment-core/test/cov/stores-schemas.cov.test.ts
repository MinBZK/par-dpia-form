import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSchemaStore } from '../../src/stores/schemas'
import { FormType } from '../../src/models/dpia'

// Build a valid DPIA schema object that io-ts (DPIA codec) will accept.
function buildSchema(opts: {
  urn?: string
  version?: string
  tasks?: any[]
} = {}) {
  return {
    name: 'Test schema',
    urn: opts.urn ?? 'urn:nl:test',
    version: opts.version ?? '1.0',
    description: 'Test',
    tasks: opts.tasks ?? [],
  }
}

describe('useSchemaStore', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    // Silence (and capture) the console.error calls on validation/error paths.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('init', () => {
    it('marks initialized and stores both valid schemas, appending conclusion tasks', () => {
      const store = useSchemaStore()

      const dpia = buildSchema({ urn: 'urn:nl:dpia', version: '3.0', tasks: [] })
      const preScan = buildSchema({ urn: 'urn:nl:prescan', version: '2.0', tasks: [] })

      store.init({ dpia, preScan })

      expect(store.isInitialized).toBe(true)
      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()

      // DPIA conclusion task appended ("Afronding") at index equal to original length (0).
      const dpiaSchema = store.getSchema(FormType.DPIA)!
      expect(dpiaSchema.tasks).toHaveLength(1)
      expect(dpiaSchema.tasks[0].task).toBe('Afronding')
      expect(dpiaSchema.tasks[0].id).toBe('0')
      expect(dpiaSchema.tasks[0].type).toContain('signing')
      expect(dpiaSchema.tasks[0].description).toContain('alle stappen')

      // Pre-scan conclusion task appended ("Resultaat pre-scan") with no description.
      const preScanSchema = store.getSchema(FormType.PRE_SCAN)!
      expect(preScanSchema.tasks).toHaveLength(1)
      expect(preScanSchema.tasks[0].task).toBe('Resultaat pre-scan')
      expect(preScanSchema.tasks[0].id).toBe('0')
      expect(preScanSchema.tasks[0].type).toContain('signing')
      expect(preScanSchema.tasks[0].description).toBeUndefined()
    })

    it('returns early and does not reprocess when already initialized', () => {
      const store = useSchemaStore()

      store.init({ dpia: buildSchema(), preScan: buildSchema() })
      expect(store.isInitialized).toBe(true)

      const dpiaBefore = store.getSchema(FormType.DPIA)

      // Second init with garbage would normally set hasErrors; early return prevents it.
      store.init({ dpia: { not: 'valid' }, preScan: { also: 'invalid' } })

      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()
      // Schema is unchanged (same object reference, not reprocessed).
      expect(store.getSchema(FormType.DPIA)).toBe(dpiaBefore)
    })

    it('does NOT append a conclusion task when a signing task already exists', () => {
      const store = useSchemaStore()

      const dpia = buildSchema({
        tasks: [
          { id: '0', task: 'Sign here', type: ['task_group', 'signing'] },
        ],
      })

      store.init({ dpia, preScan: buildSchema() })

      const dpiaSchema = store.getSchema(FormType.DPIA)!
      // Still only the original task; no extra "Afronding" task was pushed.
      expect(dpiaSchema.tasks).toHaveLength(1)
      expect(dpiaSchema.tasks[0].task).toBe('Sign here')
    })

    it('marks initialized when only one schema is valid (dpiaSuccess || preScanSuccess)', () => {
      const store = useSchemaStore()

      // dpia invalid (fails decode), preScan valid.
      store.init({ dpia: { missing: 'fields' }, preScan: buildSchema() })

      expect(store.isInitialized).toBe(true)
      // The failed schema is not stored.
      expect(store.getSchema(FormType.DPIA)).toBeNull()
      expect(store.getSchema(FormType.PRE_SCAN)).not.toBeNull()
    })

    it('is not initialized and reports errors when both schemas are invalid', () => {
      const store = useSchemaStore()

      store.init({ dpia: { bad: true }, preScan: { worse: true } })

      expect(store.isInitialized).toBe(false)
      expect(store.hasErrors).toBe(true)
      expect(store.errorMessage).toContain('JSON schema validation failed at:')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('resets error state on each init call', () => {
      const store = useSchemaStore()

      // First init: both invalid -> hasErrors true. Not initialized, so init can run again.
      store.init({ dpia: { bad: true }, preScan: { bad: true } })
      expect(store.hasErrors).toBe(true)

      // Second init with valid schemas resets the error state.
      store.init({ dpia: buildSchema(), preScan: buildSchema() })
      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()
      expect(store.isInitialized).toBe(true)
    })
  })

  describe('processSchema error/catch path', () => {
    it('captures an Error thrown during decode and uses its message', () => {
      const store = useSchemaStore()

      // A getter that throws when io-ts reads the property triggers the catch block.
      // `tasks` is accessed during validation; throwing an Error exercises the
      // `error instanceof Error` true branch.
      const exploding = {
        name: 'x',
        urn: 'urn:nl:test',
        version: '1.0',
        description: 'd',
        get tasks(): never {
          throw new Error('boom from getter')
        },
      }

      // preScan is valid so init does not early-return on a prior success;
      // here both go through processSchema and dpia throws.
      store.init({ dpia: exploding, preScan: buildSchema() })

      expect(store.hasErrors).toBe(true)
      expect(store.errorMessage).toBe('boom from getter')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected error during schema processing:',
        expect.any(Error),
      )
    })

    it('stringifies a non-Error thrown value (error instanceof Error false branch)', () => {
      const store = useSchemaStore()

      const exploding = {
        name: 'x',
        urn: 'urn:nl:test',
        version: '1.0',
        description: 'd',
        get tasks(): never {
          // eslint-disable-next-line no-throw-literal
          throw 'plain string failure'
        },
      }

      store.init({ dpia: exploding, preScan: buildSchema() })

      expect(store.hasErrors).toBe(true)
      expect(store.errorMessage).toBe('plain string failure')
    })
  })

  describe('getSchema', () => {
    it('returns null for each namespace before initialization', () => {
      const store = useSchemaStore()
      expect(store.getSchema(FormType.DPIA)).toBeNull()
      expect(store.getSchema(FormType.PRE_SCAN)).toBeNull()
    })

    it('returns null for an unknown namespace', () => {
      const store = useSchemaStore()
      store.init({ dpia: buildSchema(), preScan: buildSchema() })
      expect(store.getSchema('something-else' as FormType)).toBeNull()
    })
  })

  describe('getUrn', () => {
    it('combines urn and version for a loaded schema', () => {
      const store = useSchemaStore()
      store.init({
        dpia: buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }),
        preScan: buildSchema({ urn: 'urn:nl:prescan', version: '2.0' }),
      })

      expect(store.getUrn(FormType.DPIA)).toBe('urn:nl:dpia:3.0')
      expect(store.getUrn(FormType.PRE_SCAN)).toBe('urn:nl:prescan:2.0')
    })

    it('throws when the schema for the namespace is not loaded', () => {
      const store = useSchemaStore()
      expect(() => store.getUrn(FormType.DPIA)).toThrow(
        'Schema not loaded for namespace: dpia',
      )
    })
  })
})

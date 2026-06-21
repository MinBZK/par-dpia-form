import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSchemaStore } from '../../src/stores/schemas'
import { FormType } from '../../src/models/dpia'

function buildSchema(opts: {
  urn?: string
  version?: string
  tasks?: any[]
} = {}) {
  return {
    name: 'DPIA-assessment',
    urn: opts.urn ?? 'urn:nl:dpia',
    version: opts.version ?? '3.0',
    description: 'Verwerking persoonsgegevens',
    tasks: opts.tasks ?? [],
  }
}

describe('useSchemaStore', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('init', () => {
    it('marks initialized and stores all three valid schemas, appending conclusion tasks', () => {
      const store = useSchemaStore()

      const dpia = buildSchema({ urn: 'urn:nl:dpia', version: '3.0', tasks: [] })
      const preScan = buildSchema({ urn: 'urn:nl:prescan', version: '2.0', tasks: [] })
      const iama = buildSchema({ urn: 'urn:nl:iama', version: '1.0', tasks: [] })

      store.init({ dpia, preScan, iama })

      expect(store.isInitialized).toBe(true)
      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()

      const dpiaSchema = store.getSchema(FormType.DPIA)!
      expect(dpiaSchema.tasks).toHaveLength(1)
      expect(dpiaSchema.tasks[0].task).toBe('Afronding')
      expect(dpiaSchema.tasks[0].id).toBe('0')
      expect(dpiaSchema.tasks[0].type).toContain('signing')
      expect(dpiaSchema.tasks[0].description).toContain('alle stappen')

      const preScanSchema = store.getSchema(FormType.PRE_SCAN)!
      expect(preScanSchema.tasks).toHaveLength(1)
      expect(preScanSchema.tasks[0].task).toBe('Resultaat pre-scan')
      expect(preScanSchema.tasks[0].id).toBe('0')
      expect(preScanSchema.tasks[0].type).toContain('signing')
      expect(preScanSchema.tasks[0].description).toBeUndefined()

      const iamaSchema = store.getSchema(FormType.IAMA)!
      expect(iamaSchema.tasks).toHaveLength(1)
      expect(iamaSchema.tasks[0].task).toBe('Afronding')
      expect(iamaSchema.tasks[0].id).toBe('0')
      expect(iamaSchema.tasks[0].type).toContain('signing')
      expect(iamaSchema.tasks[0].description).toContain('alle stappen')
    })

    it('returns early and does not reprocess when already initialized', () => {
      const store = useSchemaStore()

      store.init({ dpia: buildSchema(), preScan: buildSchema(), iama: buildSchema() })
      expect(store.isInitialized).toBe(true)

      const dpiaBefore = store.getSchema(FormType.DPIA)

      store.init({ dpia: { not: 'valid' }, preScan: { also: 'invalid' }, iama: { still: 'invalid' } })

      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()
      expect(store.getSchema(FormType.DPIA)).toBe(dpiaBefore)
    })

    it('does NOT append a conclusion task when a signing task already exists', () => {
      const store = useSchemaStore()

      const dpia = buildSchema({
        tasks: [
          { id: '0', task: 'Sign here', type: ['task_group', 'signing'] },
        ],
      })

      store.init({ dpia, preScan: buildSchema(), iama: buildSchema() })

      const dpiaSchema = store.getSchema(FormType.DPIA)!
      expect(dpiaSchema.tasks).toHaveLength(1)
      expect(dpiaSchema.tasks[0].task).toBe('Sign here')
    })

    it('marks initialized when only one schema is valid (dpiaSuccess || preScanSuccess || iamaSuccess)', () => {
      const store = useSchemaStore()

      store.init({ dpia: { missing: 'fields' }, preScan: buildSchema(), iama: { missing: 'fields' } })

      expect(store.isInitialized).toBe(true)
      expect(store.getSchema(FormType.DPIA)).toBeNull()
      expect(store.getSchema(FormType.PRE_SCAN)).not.toBeNull()
    })

    it('is not initialized and reports errors when all schemas are invalid', () => {
      const store = useSchemaStore()

      store.init({ dpia: { bad: true }, preScan: { worse: true }, iama: { worst: true } })

      expect(store.isInitialized).toBe(false)
      expect(store.hasErrors).toBe(true)
      expect(store.errorMessage).toContain('JSON schema validation failed at:')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('resets error state on each init call', () => {
      const store = useSchemaStore()

      store.init({ dpia: { bad: true }, preScan: { bad: true }, iama: { bad: true } })
      expect(store.hasErrors).toBe(true)

      store.init({ dpia: buildSchema(), preScan: buildSchema(), iama: buildSchema() })
      expect(store.hasErrors).toBe(false)
      expect(store.errorMessage).toBeNull()
      expect(store.isInitialized).toBe(true)
    })
  })

  describe('processSchema error/catch path', () => {
    it('captures an Error thrown during decode and uses its message', () => {
      const store = useSchemaStore()

      // Throwing getter on `tasks` (read during decode) triggers processSchema's catch.
      const exploding = {
        name: 'DPIA-assessment',
        urn: 'urn:nl:dpia',
        version: '3.0',
        description: 'Verwerking persoonsgegevens',
        get tasks(): never {
          throw new Error('boom from getter')
        },
      }

      store.init({ dpia: exploding, preScan: buildSchema(), iama: buildSchema() })

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
        name: 'Pre-scan',
        urn: 'urn:nl:prescan',
        version: '2.0',
        description: 'Voorafgaande toets',
        get tasks(): never {
          // eslint-disable-next-line no-throw-literal
          throw 'plain string failure'
        },
      }

      store.init({ dpia: exploding, preScan: buildSchema(), iama: buildSchema() })

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
      store.init({ dpia: buildSchema(), preScan: buildSchema(), iama: buildSchema() })
      expect(store.getSchema('something-else' as FormType)).toBeNull()
    })
  })

  describe('getUrn', () => {
    it('combines urn and version for a loaded schema', () => {
      const store = useSchemaStore()
      store.init({
        dpia: buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }),
        preScan: buildSchema({ urn: 'urn:nl:prescan', version: '2.0' }),
        iama: buildSchema({ urn: 'urn:nl:iama', version: '1.0' }),
      })

      expect(store.getUrn(FormType.DPIA)).toBe('urn:nl:dpia:3.0')
      expect(store.getUrn(FormType.PRE_SCAN)).toBe('urn:nl:prescan:2.0')
    })

    it('stamps official versions coarse (MAJOR.MINOR) and concept versions precise (D1)', () => {
      const store = useSchemaStore()
      store.init({
        dpia: buildSchema({ urn: 'urn:nl:dpia', version: '3.1.0' }),
        preScan: buildSchema({ urn: 'urn:nl:prescan', version: '3.1.0-concept.2' }),
        iama: buildSchema({ urn: 'urn:nl:iama', version: '2.0' }),
      })

      // Official: stable line -> MAJOR.MINOR is enough.
      expect(store.getUrn(FormType.DPIA)).toBe('urn:nl:dpia:3.1')
      // Concept: in-flux -> keep the exact iteration.
      expect(store.getUrn(FormType.PRE_SCAN)).toBe('urn:nl:prescan:3.1.0-concept.2')
    })

    it('throws when the schema for the namespace is not loaded', () => {
      const store = useSchemaStore()
      expect(() => store.getUrn(FormType.DPIA)).toThrow(
        'Schema not loaded for namespace: dpia',
      )
    })
  })

  describe('version registry', () => {
    it('registers a definition by its full canonical urn and looks it up, augmented', () => {
      const store = useSchemaStore()
      expect(
        store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.1.0-concept.2', tasks: [] })),
      ).toBe(true)
      const def = store.getByUrn('urn:nl:dpia:3.1.0-concept.2')
      expect(def).not.toBeNull()
      expect(def!.tasks).toHaveLength(1)
      expect(def!.tasks[0].task).toBe('Afronding')
      expect(store.registeredUrns()).toContain('urn:nl:dpia:3.1.0-concept.2')
    })

    it('derives the type from the urn prefix for the conclusion task', () => {
      const store = useSchemaStore()
      store.register(buildSchema({ urn: 'urn:nl:prescan', version: '2.0', tasks: [] }))
      store.register(buildSchema({ urn: 'urn:nl:iama', version: '2.0', tasks: [] }))
      expect(store.getByUrn('urn:nl:prescan:2.0')!.tasks[0].task).toBe('Resultaat pre-scan')
      expect(store.getByUrn('urn:nl:iama:2.0')!.tasks[0].task).toBe('Afronding')
    })

    it('returns false for a definition with an unknown urn', () => {
      const store = useSchemaStore()
      expect(store.register(buildSchema({ urn: 'urn:nl:onbekend', version: '1.0' }))).toBe(false)
    })

    it('returns false when given a null or urn-less value', () => {
      const store = useSchemaStore()
      expect(store.register(null)).toBe(false)
      expect(store.register({ version: '1.0' })).toBe(false)
    })

    it('returns false for an invalid definition shape', () => {
      const store = useSchemaStore()
      expect(store.register({ ...buildSchema({ urn: 'urn:nl:dpia' }), tasks: 'kapot' })).toBe(false)
    })

    it('returns null for an unregistered urn', () => {
      const store = useSchemaStore()
      expect(store.getByUrn('urn:nl:dpia:9.9')).toBeNull()
    })

    it('init also populates the registry', () => {
      const store = useSchemaStore()
      store.init({
        dpia: buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }),
        preScan: buildSchema({ urn: 'urn:nl:prescan', version: '2.0' }),
        iama: buildSchema({ urn: 'urn:nl:iama', version: '1.0' }),
      })
      expect(store.getByUrn('urn:nl:dpia:3.0')).not.toBeNull()
      expect(store.registeredUrns()).toEqual(
        expect.arrayContaining(['urn:nl:dpia:3.0', 'urn:nl:prescan:2.0', 'urn:nl:iama:1.0']),
      )
    })

    it('keeps multiple versions of the same type side by side', () => {
      const store = useSchemaStore()
      store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }))
      store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.1.0-concept.1' }))
      expect(store.getByUrn('urn:nl:dpia:3.0')).not.toBeNull()
      expect(store.getByUrn('urn:nl:dpia:3.1.0-concept.1')).not.toBeNull()
    })

    it('keys an official version by its coarse canonical urn so getByUrn(getUrn(...)) round-trips', () => {
      const store = useSchemaStore()
      store.init({
        dpia: buildSchema({ urn: 'urn:nl:dpia', version: '3.1.0' }),
        preScan: buildSchema({ urn: 'urn:nl:prescan', version: '2.0' }),
        iama: buildSchema({ urn: 'urn:nl:iama', version: '1.0' }),
      })
      // 3.1.0 official is stamped AND keyed coarse as 3.1 (not 3.1.0).
      expect(store.getUrn(FormType.DPIA)).toBe('urn:nl:dpia:3.1')
      expect(store.getByUrn(store.getUrn(FormType.DPIA))).not.toBeNull()
      expect(store.registeredUrns()).toContain('urn:nl:dpia:3.1')
      expect(store.getByUrn('urn:nl:dpia:3.1.0')).toBeNull()
    })

    it('register does not touch the active-per-type view', () => {
      const store = useSchemaStore()
      expect(store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.1.0-concept.2' }))).toBe(true)
      expect(store.getByUrn('urn:nl:dpia:3.1.0-concept.2')).not.toBeNull()
      expect(store.getSchema(FormType.DPIA)).toBeNull()
    })

    it('register is last-write-wins for the same canonical urn (no duplicate keys)', () => {
      const store = useSchemaStore()
      store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }))
      store.register(buildSchema({ urn: 'urn:nl:dpia', version: '3.0' }))
      expect(store.registeredUrns().filter(u => u === 'urn:nl:dpia:3.0')).toHaveLength(1)
    })
  })
})

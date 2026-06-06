import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAnswerStore, isImageValue, type ImageValue } from '../../src/stores/answers'
import { FormType } from '../../src/models/dpia'

describe('isImageValue', () => {
  it('returns false for non-object primitives (typeof !== object)', () => {
    expect(isImageValue('a string')).toBe(false)
    expect(isImageValue(42)).toBe(false)
    expect(isImageValue(true)).toBe(false)
    expect(isImageValue(undefined)).toBe(false)
  })

  it('returns false for null (value === null branch)', () => {
    expect(isImageValue(null)).toBe(false)
  })

  it("returns false when 'data' key is missing (!('data' in value) branch)", () => {
    expect(isImageValue({ title: 'no data here' })).toBe(false)
    expect(isImageValue({})).toBe(false)
  })

  it('returns false when data is not a string (typeof data !== string branch)', () => {
    expect(isImageValue({ data: 123 })).toBe(false)
    expect(isImageValue({ data: null })).toBe(false)
    expect(isImageValue({ data: { nested: true } })).toBe(false)
  })

  it('returns false when data does not start with data:image/ (startsWith false branch)', () => {
    expect(isImageValue({ data: 'https://example.com/x.png' })).toBe(false)
    expect(isImageValue({ data: '' })).toBe(false)
  })

  it('returns false for SVG data URIs (svg rejection branch)', () => {
    expect(isImageValue({ data: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false)
  })

  it('returns true for a valid raster image data URI (all branches pass)', () => {
    const img: ImageValue = {
      data: 'data:image/png;base64,abc123',
      title: 'Test',
      description: 'desc',
      source: 'test.png',
    }
    expect(isImageValue(img)).toBe(true)
    expect(isImageValue({ data: 'data:image/jpeg;base64,zzz' })).toBe(true)
  })
})

describe('useAnswerStore', () => {
  let store: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAnswerStore()
  })

  describe('initial state', () => {
    it('defaults to the DPIA namespace with empty namespaces', () => {
      expect(store.activeNamespace).toBe(FormType.DPIA)
      expect(store.answers[FormType.DPIA]).toEqual({})
      expect(store.answers[FormType.PRE_SCAN]).toEqual({})
    })
  })

  describe('setActiveNamespace', () => {
    it('switches the active namespace when different', () => {
      store.setActiveNamespace(FormType.PRE_SCAN)
      expect(store.activeNamespace).toBe(FormType.PRE_SCAN)
    })

    it('does nothing when the namespace is already active (false branch of if)', () => {
      expect(store.activeNamespace).toBe(FormType.DPIA)
      store.setAnswer('1.1', 'Inleiding')
      store.setActiveNamespace(FormType.DPIA)
      expect(store.activeNamespace).toBe(FormType.DPIA)
      expect(store.getAnswer('1.1')).toBe('Inleiding')
    })

    it('initializes the namespace object when it does not yet exist (true branch of inner if)', () => {
      delete (store.answers as Record<string, unknown>)[FormType.PRE_SCAN]
      expect(store.answers[FormType.PRE_SCAN]).toBeUndefined()

      store.setActiveNamespace(FormType.PRE_SCAN)

      expect(store.answers[FormType.PRE_SCAN]).toEqual({})
    })

    it('does not reinitialize an existing namespace (false branch of inner if)', () => {
      store.setActiveNamespace(FormType.PRE_SCAN)
      store.setAnswer('0.1', 'prescan answer')
      store.setActiveNamespace(FormType.DPIA)
      store.setActiveNamespace(FormType.PRE_SCAN)
      expect(store.getAnswer('0.1')).toBe('prescan answer')
    })
  })

  describe('setAnswer / getAnswer', () => {
    it('stores an answer with a lastEditedAt timestamp in the active namespace', () => {
      store.setAnswer('2.1', 'E-mailadres')
      const stored = store.answers[FormType.DPIA]['2.1']
      expect(stored.value).toBe('E-mailadres')
      expect(typeof stored.lastEditedAt).toBe('string')
      expect(Number.isNaN(Date.parse(stored.lastEditedAt))).toBe(false)
    })

    it('getAnswer returns the stored value (truthy branch of ?. || null)', () => {
      store.setAnswer('3.1', 'Verwerkingsregister')
      expect(store.getAnswer('3.1')).toBe('Verwerkingsregister')
    })

    it('getAnswer returns null for an unknown id (optional chaining short-circuit)', () => {
      expect(store.getAnswer('does-not-exist')).toBeNull()
    })

    it('getAnswer returns null when the stored value is falsy (|| null branch)', () => {
      store.setAnswer('4.1', null)
      expect(store.getAnswer('4.1')).toBeNull()
      store.setAnswer('4.2', '')
      expect(store.getAnswer('4.2')).toBeNull()
    })

    it('stores answers per active namespace independently', () => {
      store.setAnswer('shared', 'dpia-value')
      store.setActiveNamespace(FormType.PRE_SCAN)
      store.setAnswer('shared', 'prescan-value')

      expect(store.getAnswer('shared')).toBe('prescan-value')
      store.setActiveNamespace(FormType.DPIA)
      expect(store.getAnswer('shared')).toBe('dpia-value')
    })
  })

  describe('getAnswerFromNamespace', () => {
    it('returns null when the namespace object is missing (first guard true)', () => {
      delete (store.answers as Record<string, unknown>)[FormType.PRE_SCAN]
      expect(store.getAnswerFromNamespace(FormType.PRE_SCAN, '0.1')).toBeNull()
    })

    it('returns null when the instanceId is missing in the namespace (second guard true)', () => {
      expect(store.getAnswerFromNamespace(FormType.DPIA, 'missing-id')).toBeNull()
    })

    it('returns the stored value when present (guard false, truthy value)', () => {
      store.setAnswer('1.2', 'Betrokkenen')
      expect(store.getAnswerFromNamespace(FormType.DPIA, '1.2')).toBe('Betrokkenen')
    })

    it('returns null when the stored value is falsy (|| null branch)', () => {
      store.setAnswer('1.3', '')
      expect(store.getAnswerFromNamespace(FormType.DPIA, '1.3')).toBeNull()
    })

    it('reads from a non-active namespace', () => {
      store.setActiveNamespace(FormType.PRE_SCAN)
      store.setAnswer('5.1', 'in prescan')
      store.setActiveNamespace(FormType.DPIA)
      expect(store.getAnswerFromNamespace(FormType.PRE_SCAN, '5.1')).toBe('in prescan')
    })
  })

  describe('removeAnswer', () => {
    it('removes an answer from the active namespace', () => {
      store.setAnswer('6.1', 'Bewaartermijn')
      expect(store.getAnswer('6.1')).toBe('Bewaartermijn')
      store.removeAnswer('6.1')
      expect(store.getAnswer('6.1')).toBeNull()
      expect(store.answers[FormType.DPIA]['6.1']).toBeUndefined()
    })

    it('is a no-op when the answer does not exist', () => {
      expect(() => store.removeAnswer('never-existed')).not.toThrow()
      expect(store.getAnswer('never-existed')).toBeNull()
    })
  })

  describe('removeAnswerForInstances', () => {
    it('removes every listed instance id', () => {
      store.setAnswer('2.1', 'E-mailadres')
      store.setAnswer('2.2', 'Telefoonnummer')
      store.setAnswer('2.3', 'BSN')

      store.removeAnswerForInstances(['2.1', '2.3'])

      expect(store.getAnswer('2.1')).toBeNull()
      expect(store.getAnswer('2.2')).toBe('Telefoonnummer')
      expect(store.getAnswer('2.3')).toBeNull()
    })

    it('handles an empty list (forEach over no elements)', () => {
      store.setAnswer('keep', 'x')
      store.removeAnswerForInstances([])
      expect(store.getAnswer('keep')).toBe('x')
    })
  })

  describe('reset', () => {
    it('clears all namespaces and returns to the DPIA namespace', () => {
      store.setActiveNamespace(FormType.PRE_SCAN)
      store.setAnswer('p', 'prescan')
      store.setActiveNamespace(FormType.DPIA)
      store.setAnswer('d', 'dpia')

      store.reset()

      expect(store.activeNamespace).toBe(FormType.DPIA)
      expect(store.answers[FormType.DPIA]).toEqual({})
      expect(store.answers[FormType.PRE_SCAN]).toEqual({})
    })
  })
})

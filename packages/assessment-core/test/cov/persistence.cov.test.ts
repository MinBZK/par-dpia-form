import { describe, it, expect, vi } from 'vitest'
import { PERSISTENCE_KEY, type PersistenceProvider } from '../../src/persistence'
import type { AssessmentState } from '../../src/models/assessmentState'
import { FormType } from '../../src/models/dpia'

describe('PERSISTENCE_KEY', () => {
  it('is a Symbol usable as a Vue InjectionKey', () => {
    expect(typeof PERSISTENCE_KEY).toBe('symbol')
  })

  it('carries the "persistence" description', () => {
    expect(PERSISTENCE_KEY.toString()).toBe('Symbol(persistence)')
    expect(PERSISTENCE_KEY.description).toBe('persistence')
  })

  it('is a unique, stable reference (Symbol is not interned)', () => {
    expect(PERSISTENCE_KEY).toBe(PERSISTENCE_KEY)
    expect(PERSISTENCE_KEY).not.toBe(Symbol('persistence'))
  })

  it('can be used as an object key', () => {
    const container: Record<symbol, string> = { [PERSISTENCE_KEY]: 'provided' }
    expect(container[PERSISTENCE_KEY]).toBe('provided')
  })
})

describe('PersistenceProvider interface', () => {
  const baseState: AssessmentState = {
    metadata: { createdAt: '2026-01-01T00:00:00Z' },
    answers: {},
  }

  it('is satisfied by an object implementing only the required members', () => {
    const saveAppState = vi.fn()
    const loadAppState = vi.fn<(namespace?: FormType) => AssessmentState | null>(
      () => baseState,
    )
    const applyAppState = vi.fn()
    const clearSavedState = vi.fn()
    const setupWatchers = vi.fn<() => (() => void) | void>(() => undefined)

    const provider: PersistenceProvider = {
      saveAppState,
      loadAppState,
      applyAppState,
      clearSavedState,
      setupWatchers,
    }

    provider.saveAppState()
    expect(loadAppState).not.toHaveBeenCalled()

    expect(provider.loadAppState()).toBe(baseState)
    expect(provider.loadAppState(FormType.DPIA)).toBe(baseState)

    provider.applyAppState(baseState)
    provider.clearSavedState()
    provider.clearSavedState(FormType.PRE_SCAN)
    expect(provider.setupWatchers()).toBeUndefined()

    expect(saveAppState).toHaveBeenCalledTimes(1)
    expect(loadAppState).toHaveBeenCalledTimes(2)
    expect(applyAppState).toHaveBeenCalledWith(baseState)
    expect(clearSavedState).toHaveBeenCalledTimes(2)
    expect(setupWatchers).toHaveBeenCalledTimes(1)

    expect(provider.flushSave).toBeUndefined()
    expect(provider.restoreUiState).toBeUndefined()
    expect(provider.snapshotBaseline).toBeUndefined()
  })

  it('supports async return values for the awaitable members', async () => {
    const provider: PersistenceProvider = {
      saveAppState: () => Promise.resolve(),
      loadAppState: () => Promise.resolve(baseState),
      applyAppState: () => {},
      clearSavedState: () => Promise.resolve(),
      setupWatchers: () => {},
      flushSave: () => Promise.resolve(),
    }

    await expect(provider.saveAppState()).resolves.toBeUndefined()
    await expect(provider.loadAppState(FormType.PRE_SCAN)).resolves.toBe(baseState)
    await expect(provider.clearSavedState()).resolves.toBeUndefined()
    await expect(provider.flushSave?.()).resolves.toBeUndefined()
  })

  it('supports a setupWatchers that returns a teardown function', () => {
    const teardown = vi.fn()
    const provider: PersistenceProvider = {
      saveAppState: () => {},
      loadAppState: () => null,
      applyAppState: () => {},
      clearSavedState: () => {},
      setupWatchers: () => teardown,
    }

    const stop = provider.setupWatchers()
    expect(typeof stop).toBe('function')
    ;(stop as () => void)()
    expect(teardown).toHaveBeenCalledTimes(1)

    expect(provider.loadAppState()).toBeNull()
  })

  it('invokes the optional lifecycle hooks when implemented', () => {
    const flushSave = vi.fn()
    const restoreUiState = vi.fn()
    const snapshotBaseline = vi.fn()

    const provider: PersistenceProvider = {
      saveAppState: () => {},
      loadAppState: () => null,
      applyAppState: () => {},
      clearSavedState: () => {},
      setupWatchers: () => {},
      flushSave,
      restoreUiState,
      snapshotBaseline,
    }

    provider.flushSave?.()
    provider.restoreUiState?.()
    provider.snapshotBaseline?.()

    expect(flushSave).toHaveBeenCalledTimes(1)
    expect(restoreUiState).toHaveBeenCalledTimes(1)
    expect(snapshotBaseline).toHaveBeenCalledTimes(1)
  })
})

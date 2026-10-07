import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSchemaStore, FormType } from '@overheid-assessment/core'
import { normalizeServerState } from '../../src/utils/normalizeServerState'

const schema = (urn: string) => ({ name: 'Test', urn, version: '1.0', description: 'Test', tasks: [] })

const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('normalizeServerState', () => {
  it('returns an empty state when there is no metadata', () => {
    const state = normalizeServerState({ answers: { '1.1': answer('x') } }, FormType.DPIA)
    expect(state.answers).toEqual({})
    expect(state.metadata.createdAt).toEqual(expect.any(String))
  })

  it('keeps flat answers and completed tasks as they are', () => {
    useSchemaStore().init({ dpia: schema('urn:nl:dpia'), preScan: schema('urn:nl:prescan') } as never)
    const state = normalizeServerState({
      metadata: { createdAt: 'c', urn: 'urn:nl:iama:1.0', completedTasks: ['1'] },
      answers: { '1.1': answer('Plat') },
    }, FormType.IAMA)
    expect(state).toEqual({
      metadata: { urn: 'urn:nl:iama:1.0', createdAt: 'c', completedTasks: ['1'] },
      answers: { '1.1': answer('Plat') },
    })
  })

  it('leaves completedTasks out when none are stored', () => {
    const state = normalizeServerState({ metadata: { createdAt: 'c' } }, FormType.IAMA)
    expect(state).toEqual({ metadata: { urn: undefined, createdAt: 'c' }, answers: {} })
  })

  it('unwraps the namespace-keyed format for the requested namespace', () => {
    const state = normalizeServerState({
      metadata: { createdAt: 'c' },
      answers: { [FormType.DPIA]: { '1.1': answer('DPIA') }, [FormType.PRE_SCAN]: { '0.1': answer('Pre') } },
      taskState: { [FormType.PRE_SCAN]: { completedRootTaskIds: ['0'] } },
    }, FormType.PRE_SCAN)
    expect(state.answers).toEqual({ '0.1': answer('Pre') })
    expect(state.metadata.completedTasks).toEqual(['0'])
  })

  it('falls back to metadata.completedTasks, or none, in the namespace-keyed format', () => {
    const stored = {
      metadata: { createdAt: 'c', completedTasks: ['2'] },
      answers: { [FormType.DPIA]: { '1.1': answer('DPIA') } },
    }
    expect(normalizeServerState(stored, FormType.DPIA).metadata.completedTasks).toEqual(['2'])

    const withoutCompleted = { metadata: { createdAt: 'c' }, answers: stored.answers }
    const iama = normalizeServerState(withoutCompleted, FormType.IAMA)
    expect(iama.answers).toEqual({})
    expect(iama.metadata.completedTasks).toBeUndefined()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHiddenAnswerCache } from '../../src/utils/hiddenAnswerCache'
import type { Answer } from '../../src/stores/answers'

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('createHiddenAnswerCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores entries and exposes their instance ids via keys()', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([
      { instanceId: '2.1', answer: answer('E-mailadres') },
      { instanceId: '2.2', answer: answer('Telefoonnummer') },
    ])

    expect(cache.keys().sort()).toEqual(['2.1', '2.2'])
  })

  it('consumes stored entries and removes them from the cache', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([
      { instanceId: '2.1', answer: answer('E-mailadres') },
      { instanceId: '2.2', answer: answer('Telefoonnummer') },
    ])

    const consumed = cache.consume(['2.1', '2.2'])

    expect(consumed).toHaveLength(2)
    const byId = Object.fromEntries(consumed.map((e) => [e.instanceId, e]))
    expect(byId['2.1'].answer).toEqual(answer('E-mailadres'))
    expect(byId['2.2'].answer).toEqual(answer('Telefoonnummer'))
    expect(byId['2.1'].expiresAt).toBeGreaterThan(Date.now())

    expect(cache.keys()).toEqual([])
    expect(cache.consume(['2.1', '2.2'])).toEqual([])
  })

  it('skips unknown instance ids on consume (entry is undefined)', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])

    const consumed = cache.consume(['9.9', '2.1'])

    expect(consumed.map((e) => e.instanceId)).toEqual(['2.1'])
    expect(cache.keys()).toEqual([])
  })

  it('overwrites an existing entry on re-store (drop with active timer)', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])
    cache.store([{ instanceId: '2.1', answer: answer('Postadres') }])

    const consumed = cache.consume(['2.1'])
    expect(consumed).toHaveLength(1)
    expect(consumed[0].answer).toEqual(answer('Postadres'))
  })

  it('does not return expired entries from consume() but still drops them', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])

    vi.advanceTimersByTime(1001)

    expect(cache.consume(['2.1'])).toEqual([])
  })

  it('excludes expired entries from keys() (expiresAt <= now branch)', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])

    expect(cache.keys()).toEqual(['2.1'])

    // setSystemTime (not advanceTimersByTime) so the expiry timer does NOT fire:
    // the entry stays in the map but goes stale, exercising the keys() filter.
    vi.setSystemTime(Date.now() + 2000)

    expect(cache.keys()).toEqual([])
  })

  it('does not return a stale entry from consume() even if its timer has not fired', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])

    // setSystemTime keeps the entry in the map but stale, so consume() takes
    // the expiresAt > now === false path and drops without pushing.
    vi.setSystemTime(Date.now() + 2000)

    expect(cache.consume(['2.1'])).toEqual([])
    expect(cache.keys()).toEqual([])
  })

  it('uses the default TTL when no ttlMs argument is given', () => {
    const cache = createHiddenAnswerCache()
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])

    expect(cache.keys()).toEqual(['2.1'])

    vi.setSystemTime(Date.now() + 30_000)
    expect(cache.keys()).toEqual(['2.1'])

    vi.setSystemTime(Date.now() + 60_001)
    expect(cache.keys()).toEqual([])
  })

  it('clear() releases pending timers and empties the cache', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([
      { instanceId: '2.1', answer: answer('E-mailadres') },
      { instanceId: '2.2', answer: answer('Telefoonnummer') },
    ])

    cache.clear()

    expect(cache.keys()).toEqual([])
    expect(cache.consume(['2.1', '2.2'])).toEqual([])

    vi.advanceTimersByTime(5000)
    expect(cache.keys()).toEqual([])
  })

  it('drop() handles an absent timer when consuming an already-fired entry', () => {
    const cache = createHiddenAnswerCache(500)
    cache.store([{ instanceId: '2.1', answer: answer('E-mailadres') }])
    vi.advanceTimersByTime(600)
    expect(cache.consume(['2.1'])).toEqual([])
  })
})

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
      { instanceId: 'a', answer: answer('Alpha') },
      { instanceId: 'b', answer: answer('Bravo') },
    ])

    expect(cache.keys().sort()).toEqual(['a', 'b'])
  })

  it('consumes stored entries and removes them from the cache', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([
      { instanceId: 'a', answer: answer('Alpha') },
      { instanceId: 'b', answer: answer('Bravo') },
    ])

    const consumed = cache.consume(['a', 'b'])

    expect(consumed).toHaveLength(2)
    const byId = Object.fromEntries(consumed.map((e) => [e.instanceId, e]))
    expect(byId.a.answer).toEqual(answer('Alpha'))
    expect(byId.b.answer).toEqual(answer('Bravo'))
    // expiresAt reflects the TTL window
    expect(byId.a.expiresAt).toBeGreaterThan(Date.now())

    // Once consumed, the entries are gone
    expect(cache.keys()).toEqual([])
    expect(cache.consume(['a', 'b'])).toEqual([])
  })

  it('skips unknown instance ids on consume (entry is undefined)', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])

    // 'missing' has no entry → continue branch; 'a' is consumed
    const consumed = cache.consume(['missing', 'a'])

    expect(consumed.map((e) => e.instanceId)).toEqual(['a'])
    expect(cache.keys()).toEqual([])
  })

  it('overwrites an existing entry on re-store (drop with active timer)', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: 'a', answer: answer('First') }])
    // Re-store same id: drop() runs while a timer exists → clearTimeout branch
    cache.store([{ instanceId: 'a', answer: answer('Second') }])

    const consumed = cache.consume(['a'])
    expect(consumed).toHaveLength(1)
    expect(consumed[0].answer).toEqual(answer('Second'))
  })

  it('does not return expired entries from consume() but still drops them', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])

    // Advance just past the expiry window so the timer fires and drop() runs.
    vi.advanceTimersByTime(1001)

    // After the timer fired the entry is already gone → consume hits the
    // !entry continue branch.
    expect(cache.consume(['a'])).toEqual([])
  })

  it('excludes expired entries from keys() (expiresAt <= now branch)', () => {
    // Use real timers here so the expiry timer does NOT auto-fire; we drive
    // Date.now() forward via fake time without advancing pending timers.
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])

    expect(cache.keys()).toEqual(['a'])

    // Move time past expiry but do NOT run the timer, so the entry is still in
    // the map yet stale → keys() filters it out via expiresAt > now === false.
    vi.setSystemTime(Date.now() + 2000)

    expect(cache.keys()).toEqual([])
  })

  it('does not return a stale entry from consume() even if its timer has not fired', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])

    // Advance system time past expiry without running timers: the entry is
    // still present in the map but stale → consume() takes the
    // expiresAt > now === false path and drops without pushing.
    vi.setSystemTime(Date.now() + 2000)

    expect(cache.consume(['a'])).toEqual([])
    expect(cache.keys()).toEqual([])
  })

  it('uses the default TTL when no ttlMs argument is given', () => {
    // Exercises the default-parameter branch (ttlMs = DEFAULT_TTL_MS).
    const cache = createHiddenAnswerCache()
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])

    expect(cache.keys()).toEqual(['a'])

    // Still present well within the 60s default window.
    vi.setSystemTime(Date.now() + 30_000)
    expect(cache.keys()).toEqual(['a'])

    // Gone after the default window elapses.
    vi.setSystemTime(Date.now() + 60_001)
    expect(cache.keys()).toEqual([])
  })

  it('clear() releases pending timers and empties the cache', () => {
    const cache = createHiddenAnswerCache(1000)
    cache.store([
      { instanceId: 'a', answer: answer('Alpha') },
      { instanceId: 'b', answer: answer('Bravo') },
    ])

    cache.clear()

    expect(cache.keys()).toEqual([])
    expect(cache.consume(['a', 'b'])).toEqual([])

    // No timers remain, so advancing time has no further effect.
    vi.advanceTimersByTime(5000)
    expect(cache.keys()).toEqual([])
  })

  it('drop() handles an absent timer when consuming an already-fired entry', () => {
    // Storing then letting the timer fire deletes both entry and timer; a
    // subsequent consume of the same id finds no entry, exercising the
    // surrounding flow without an active timer.
    const cache = createHiddenAnswerCache(500)
    cache.store([{ instanceId: 'a', answer: answer('Alpha') }])
    vi.advanceTimersByTime(600)
    expect(cache.consume(['a'])).toEqual([])
  })
})

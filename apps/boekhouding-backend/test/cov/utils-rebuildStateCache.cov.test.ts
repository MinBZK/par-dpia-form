import { describe, it, expect, beforeEach } from 'vitest'
import {
  rebuildCacheKey,
  getCachedRebuild,
  setCachedRebuild,
  clearRebuildCache,
} from '../../src/utils/rebuildStateCache.js'

beforeEach(() => clearRebuildCache())

describe('rebuildStateCache', () => {
  it('builds a stable key from id + version', () => {
    expect(rebuildCacheKey('abc', 3)).toBe('abc:3')
  })

  it('returns undefined on a miss and the value on a hit', () => {
    const key = rebuildCacheKey('a', 1)
    expect(getCachedRebuild(key)).toBeUndefined()
    setCachedRebuild(key, { answers: { '0.1': 'x' } })
    expect(getCachedRebuild(key)).toEqual({ answers: { '0.1': 'x' } })
  })

  it('evicts the least-recently-used entry beyond the cap', () => {
    // Fill the cache to its cap (64), then touch key 0 so it is the newest.
    for (let i = 0; i < 64; i++) setCachedRebuild(rebuildCacheKey('a', i), { v: i })
    expect(getCachedRebuild(rebuildCacheKey('a', 0))).toEqual({ v: 0 }) // refresh recency

    // One more insert evicts the now-oldest (key 1), not the refreshed key 0.
    setCachedRebuild(rebuildCacheKey('a', 64), { v: 64 })
    expect(getCachedRebuild(rebuildCacheKey('a', 0))).toEqual({ v: 0 })
    expect(getCachedRebuild(rebuildCacheKey('a', 1))).toBeUndefined()
    expect(getCachedRebuild(rebuildCacheKey('a', 64))).toEqual({ v: 64 })
  })

  it('does not cache an oversized state', () => {
    const key = rebuildCacheKey('big', 1)
    setCachedRebuild(key, { blob: 'x'.repeat(512 * 1024 + 1) })
    expect(getCachedRebuild(key)).toBeUndefined()
  })

  it('does not cache a non-serialisable value', () => {
    const key = rebuildCacheKey('circular', 1)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    setCachedRebuild(key, circular)
    expect(getCachedRebuild(key)).toBeUndefined()
  })
})

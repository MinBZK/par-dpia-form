import { describe, it, expect } from 'vitest'
import { createUserIdCache, userIdCache } from '../../src/utils/userIdCache.js'

describe('userIdCache — get', () => {
  it('returns undefined on a miss (no entry)', () => {
    const cache = createUserIdCache(2, 1000)
    expect(cache.get('absent', 0)).toBeUndefined()
  })

  it('returns the id while the entry is fresh', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('sub', 'id-1', undefined, 0)
    expect(cache.get('sub', 999)).toBe('id-1')
  })

  it('treats an entry as expired once now reaches expiresAt and deletes it', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('sub', 'id-1', undefined, 0) // expiresAt = 1000
    expect(cache.get('sub', 1000)).toBeUndefined()
    // Deleted: a later read with a still-fresh clock is also a miss.
    expect(cache.get('sub', 0)).toBeUndefined()
  })
})

describe('userIdCache — set TTL handling', () => {
  it('uses the max TTL when the token has no exp', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('sub', 'id-1', undefined, 0)
    expect(cache.get('sub', 999)).toBe('id-1')
    expect(cache.get('sub', 1000)).toBeUndefined()
  })

  it('caps the TTL at the token exp when it is sooner than maxTtl', () => {
    const cache = createUserIdCache(2, 1000)
    // exp = 0.5s → 500ms; now = 100ms → remaining 400ms < maxTtl 1000ms
    cache.set('sub', 'id-1', 0.5, 100)
    expect(cache.get('sub', 499)).toBe('id-1')
    expect(cache.get('sub', 500)).toBeUndefined()
  })

  it('uses maxTtl when the token exp is further away', () => {
    const cache = createUserIdCache(2, 1000)
    // exp = 100s → 100000ms remaining, far beyond maxTtl 1000ms
    cache.set('sub', 'id-1', 100, 0)
    expect(cache.get('sub', 999)).toBe('id-1')
    expect(cache.get('sub', 1000)).toBeUndefined()
  })

  it('does not cache when the token is already expired (non-positive TTL)', () => {
    const cache = createUserIdCache(2, 1000)
    // exp = 1s → 1000ms; now = 5000ms → remaining negative
    cache.set('sub', 'id-1', 1, 5000)
    expect(cache.get('sub', 5000)).toBeUndefined()
  })
})

describe('userIdCache — bounded size', () => {
  it('evicts the oldest entry when a new key exceeds maxEntries', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('a', 'id-a', undefined, 0)
    cache.set('b', 'id-b', undefined, 0)
    cache.set('c', 'id-c', undefined, 0) // size was 2 → evicts oldest ('a')

    expect(cache.get('a', 0)).toBeUndefined()
    expect(cache.get('b', 0)).toBe('id-b')
    expect(cache.get('c', 0)).toBe('id-c')
  })

  it('does not evict when updating an existing key at capacity', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('a', 'id-a', undefined, 0)
    cache.set('b', 'id-b', undefined, 0)
    cache.set('b', 'id-b2', undefined, 0) // at capacity but key exists → update only

    expect(cache.get('a', 0)).toBe('id-a')
    expect(cache.get('b', 0)).toBe('id-b2')
  })
})

describe('userIdCache — clear + default instance', () => {
  it('clear() empties the cache', () => {
    const cache = createUserIdCache(2, 1000)
    cache.set('a', 'id-a', undefined, 0)
    cache.clear()
    expect(cache.get('a', 0)).toBeUndefined()
  })

  it('exposes a default instance built with the built-in limits', () => {
    userIdCache.clear()
    userIdCache.set('sub', 'id-x', undefined, 0)
    expect(userIdCache.get('sub', 0)).toBe('id-x')
    userIdCache.clear()
    expect(userIdCache.get('sub', 0)).toBeUndefined()
  })
})

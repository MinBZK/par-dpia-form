// Bounded in-memory LRU for rebuildState results.
//
// Only *immutable* rebuilds are cached: the state at a version strictly older
// than the current one. Once a newer version exists, the edits for versions
// up to that point are frozen (consolidation only ever touches the latest
// version), so the rebuilt state can never change — no invalidation needed.
//
// Two bounds keep memory safe: a max entry count, and a per-entry size cap so a
// single assessment with large embedded images cannot blow up the cache.

const MAX_ENTRIES = 64
const MAX_ENTRY_BYTES = 512 * 1024

const cache = new Map<string, unknown>()

export function rebuildCacheKey(assessmentInstanceId: string, upToVersion: number): string {
  return `${assessmentInstanceId}:${upToVersion}`
}

export function getCachedRebuild(key: string): unknown | undefined {
  if (!cache.has(key)) return undefined
  // Refresh recency: delete + re-insert moves the key to the newest position.
  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

export function setCachedRebuild(key: string, value: unknown): void {
  // Skip oversized states (or anything non-serialisable) to bound memory.
  let bytes: number
  try {
    bytes = JSON.stringify(value).length
  } catch {
    return
  }
  if (bytes > MAX_ENTRY_BYTES) return

  cache.delete(key)
  cache.set(key, value)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string
    cache.delete(oldest)
  }
}

// Test-only: reset between cases so cache state does not leak across tests.
export function clearRebuildCache(): void {
  cache.clear()
}

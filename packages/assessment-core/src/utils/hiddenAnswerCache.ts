import type { Answer } from '../stores/answers'

/**
 * In-memory cache for answers that were just cleared because a conditional
 * parent changed. Lives only for the current session — not persisted.
 *
 * The purpose is a natural "undo": if the user flips the conditional parent
 * back to its previous value within the TTL window, the cached answers can
 * be restored so the fields repopulate. After the TTL, entries are discarded.
 */

const DEFAULT_TTL_MS = 60_000

export interface CachedAnswerEntry {
  instanceId: string
  answer: Answer
  expiresAt: number
}

export interface HiddenAnswerCache {
  /** Store entries with the default TTL. */
  store(entries: Array<{ instanceId: string; answer: Answer }>): void
  /** Consume cached entries for the provided instance ids; removes them from the cache. */
  consume(instanceIds: string[]): CachedAnswerEntry[]
  /** Instance ids currently held in the cache (excluding expired ones). */
  keys(): string[]
  /** Reset — releases pending timers. */
  clear(): void
}

export function createHiddenAnswerCache(ttlMs: number = DEFAULT_TTL_MS): HiddenAnswerCache {
  const cache = new Map<string, CachedAnswerEntry>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function drop(instanceId: string): void {
    cache.delete(instanceId)
    const t = timers.get(instanceId)
    if (t) {
      clearTimeout(t)
      timers.delete(instanceId)
    }
  }

  return {
    store(entries) {
      const expiresAt = Date.now() + ttlMs
      for (const { instanceId, answer } of entries) {
        drop(instanceId)
        cache.set(instanceId, { instanceId, answer, expiresAt })
        timers.set(
          instanceId,
          setTimeout(() => drop(instanceId), ttlMs),
        )
      }
    },
    consume(instanceIds) {
      const now = Date.now()
      const result: CachedAnswerEntry[] = []
      for (const id of instanceIds) {
        const entry = cache.get(id)
        if (!entry) continue
        if (entry.expiresAt > now) result.push(entry)
        drop(id)
      }
      return result
    },
    keys() {
      const now = Date.now()
      const result: string[] = []
      for (const [id, entry] of cache) {
        if (entry.expiresAt > now) result.push(id)
      }
      return result
    },
    clear() {
      for (const t of timers.values()) clearTimeout(t)
      cache.clear()
      timers.clear()
    },
  }
}

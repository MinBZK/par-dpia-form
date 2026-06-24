// In-memory cache mapping an OIDC subject (`sub`) to our internal user id, so
// that authenticated polling clients don't trigger a users-lookup on every
// request. Security/privacy properties (see the PR scaling audit):
//
// - Stores ONLY the internal id — never email/displayName. The per-request
//   token carries those, so no personal data lingers in process memory
//   (AVG dataminimalisatie).
// - Caches nothing about authorization. Project/assessment access is always
//   checked live against the database, so revoking access takes effect at once.
// - An entry never outlives its token: the TTL is capped at `maxTtlMs` AND at
//   the token's own remaining lifetime.
// - Bounded size with oldest-first eviction, so a flood of distinct subjects
//   cannot exhaust memory (availability / DoS).
// - The cache only ever maps to an already-resolved id; on any uncertainty the
//   caller falls back to the database lookup — it never grants access on its own.
export interface UserIdCache {
  /** Returns the cached id for `oidcSub`, or undefined on a miss/expired entry. */
  get(oidcSub: string, now: number): string | undefined
  /** Caches `id` for `oidcSub`. `tokenExpSeconds` is the JWT `exp` claim (seconds). */
  set(oidcSub: string, id: string, tokenExpSeconds: number | undefined, now: number): void
  clear(): void
}

export function createUserIdCache(maxEntries = 10_000, maxTtlMs = 60_000): UserIdCache {
  const store = new Map<string, { id: string; expiresAt: number }>()
  return {
    get(oidcSub, now) {
      const entry = store.get(oidcSub)
      if (!entry) return undefined
      if (entry.expiresAt <= now) {
        store.delete(oidcSub)
        return undefined
      }
      return entry.id
    },
    set(oidcSub, id, tokenExpSeconds, now) {
      let ttl = maxTtlMs
      if (tokenExpSeconds !== undefined) {
        ttl = Math.min(ttl, tokenExpSeconds * 1000 - now)
      }
      if (ttl <= 0) return
      if (store.size >= maxEntries && !store.has(oidcSub)) {
        // Map preserves insertion order, so the first key is the oldest.
        store.delete(store.keys().next().value as string)
      }
      store.set(oidcSub, { id, expiresAt: now + ttl })
    },
    clear() {
      store.clear()
    },
  }
}

export const userIdCache = createUserIdCache()

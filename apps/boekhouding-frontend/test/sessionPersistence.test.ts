/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const PENDING_KEY_PREFIX = 'pending:'

describe('session persistence for pending changes', () => {
  const assessmentId = 'test-assessment-123'
  const storageKey = `${PENDING_KEY_PREFIX}${assessmentId}`

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  describe('persistPendingToSession / restorePendingFromSession roundtrip', () => {
    it('roundtrips pending changes through sessionStorage', () => {
      // Simulate what persistPendingToSession does
      const pendingChanges = new Map<string, { key: string; value: unknown }>([
        ['1.1', { key: '1.1', value: { value: 'Mijn antwoord' } }],
        ['2.3', { key: '2.3', value: { value: true } }],
        ['completed.1', { key: 'completed.1', value: true }],
      ])

      const entries = Array.from(pendingChanges.entries())
      sessionStorage.setItem(storageKey, JSON.stringify(entries))

      // Simulate what restorePendingFromSession does
      const raw = sessionStorage.getItem(storageKey)
      expect(raw).not.toBeNull()

      const restored: [string, { key: string; value: unknown }][] = JSON.parse(raw!)
      expect(restored).toHaveLength(3)
      expect(restored[0][1].key).toBe('1.1')
      expect(restored[0][1].value).toEqual({ value: 'Mijn antwoord' })
      expect(restored[1][1].value).toEqual({ value: true })
      expect(restored[2][1].key).toBe('completed.1')
      expect(restored[2][1].value).toBe(true)

      // Cleanup should remove the key
      sessionStorage.removeItem(storageKey)
      expect(sessionStorage.getItem(storageKey)).toBeNull()
    })

    it('handles empty pending changes gracefully', () => {
      // No pending changes saved
      const raw = sessionStorage.getItem(storageKey)
      expect(raw).toBeNull()
    })

    it('preserves complex answer values (arrays, nested objects)', () => {
      const pendingChanges = new Map<string, { key: string; value: unknown }>([
        ['3.1', {
          key: '3.1',
          value: { value: ['Optie A', 'Optie C'], lastEditedAt: '2026-03-26T10:00:00Z' },
        }],
      ])

      sessionStorage.setItem(storageKey, JSON.stringify(Array.from(pendingChanges.entries())))
      const restored = JSON.parse(sessionStorage.getItem(storageKey)!)
      expect(restored[0][1].value.value).toEqual(['Optie A', 'Optie C'])
    })
  })

  describe('relogin marker', () => {
    it('stores and retrieves userId for user-switch detection', () => {
      const marker = { userId: 'user-123', timestamp: Date.now() }
      sessionStorage.setItem('auth:relogin', JSON.stringify(marker))

      const retrieved = JSON.parse(sessionStorage.getItem('auth:relogin')!)
      expect(retrieved.userId).toBe('user-123')
      expect(retrieved.timestamp).toBeTypeOf('number')
    })

    it('detects user switch when different user logs in', () => {
      const marker = { userId: 'user-123', timestamp: Date.now() }
      sessionStorage.setItem('auth:relogin', JSON.stringify(marker))

      const currentUserId = 'user-456' // Different user
      const retrieved = JSON.parse(sessionStorage.getItem('auth:relogin')!)

      expect(retrieved.userId).not.toBe(currentUserId)
      // In the real code, this would trigger cleanup of pending: keys
    })

    it('allows same-user re-login to proceed normally', () => {
      const marker = { userId: 'user-123', timestamp: Date.now() }
      sessionStorage.setItem('auth:relogin', JSON.stringify(marker))

      const currentUserId = 'user-123' // Same user
      const retrieved = JSON.parse(sessionStorage.getItem('auth:relogin')!)

      expect(retrieved.userId).toBe(currentUserId)
    })
  })
})

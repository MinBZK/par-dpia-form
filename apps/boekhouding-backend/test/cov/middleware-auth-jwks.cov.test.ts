import { describe, it, expect, vi } from 'vitest'
import { warmUpJwks } from '../../src/middleware/auth.js'

describe('warmUpJwks — best-effort pre-warming', () => {
  it('resolves without throwing when the warm action succeeds', async () => {
    const warm = vi.fn().mockResolvedValue(undefined)
    await expect(warmUpJwks(warm)).resolves.toBeUndefined()
    expect(warm).toHaveBeenCalledOnce()
  })

  it('swallows the error and resolves when the warm action rejects (Keycloak unreachable)', async () => {
    const warm = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(warmUpJwks(warm)).resolves.toBeUndefined()
    expect(warm).toHaveBeenCalledOnce()
  })

  it('uses the default warm action when called without arguments (covers defaultWarm branch)', async () => {
    // The test JWKS server is running (configured in test/setup.ts), so the
    // real reload() against the loopback server must also succeed without throwing.
    await expect(warmUpJwks()).resolves.toBeUndefined()
  })
})

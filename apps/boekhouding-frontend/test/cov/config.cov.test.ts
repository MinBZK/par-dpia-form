/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type ConfigModule = typeof import('../../src/config')

// Re-import fresh so the module-level `config` cache does not leak between cases.
async function freshModule(): Promise<ConfigModule> {
  vi.resetModules()
  return import('../../src/config')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('config', () => {
  describe('loadConfig() success path', () => {
    it('returns the JSON payload from /config.json', async () => {
      const payload = {
        keycloakUrl: 'https://keycloak.assessment.test',
        keycloakRealm: 'assessment-boekhouding',
        keycloakClientId: 'boekhouding-frontend',
        standaloneUrl: '/invulhulpen/',
      }
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve(payload),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { loadConfig } = await freshModule()
      const result = await loadConfig()

      expect(fetchMock).toHaveBeenCalledWith('/config.json')
      expect(result).toEqual(payload)
    })
  })

  describe('loadConfig() catch path (fetch fails)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    })

    it('uses VITE_* env values when they are set (left side of ||)', async () => {
      vi.stubEnv('VITE_KEYCLOAK_URL', 'https://env-kc.test')
      vi.stubEnv('VITE_KEYCLOAK_REALM', 'env-realm')
      vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', 'env-client')
      vi.stubEnv('VITE_STANDALONE_URL', '/env-standalone/')

      const { loadConfig } = await freshModule()
      const result = await loadConfig()

      expect(result).toEqual({
        keycloakUrl: 'https://env-kc.test',
        keycloakRealm: 'env-realm',
        keycloakClientId: 'env-client',
        standaloneUrl: '/env-standalone/',
      })
    })

    it('falls back to defaults when VITE_* env values are empty (right side of ||)', async () => {
      vi.stubEnv('VITE_KEYCLOAK_URL', '')
      vi.stubEnv('VITE_KEYCLOAK_REALM', '')
      vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', '')
      vi.stubEnv('VITE_STANDALONE_URL', '')

      const { loadConfig } = await freshModule()
      const result = await loadConfig()

      expect(result).toEqual({
        keycloakUrl: 'http://localhost:8080',
        keycloakRealm: 'assessment-boekhouding',
        keycloakClientId: 'boekhouding-frontend',
        standaloneUrl: '/invulhulpen/',
      })
    })
  })

  describe('getConfig()', () => {
    it('throws when loadConfig() has not run yet', async () => {
      const { getConfig } = await freshModule()

      expect(() => getConfig()).toThrow('Config not loaded — call loadConfig() first')
    })

    it('returns the cached config after loadConfig() has run', async () => {
      const payload = {
        keycloakUrl: 'https://keycloak.assessment.test',
        keycloakRealm: 'assessment-boekhouding',
        keycloakClientId: 'boekhouding-frontend',
        standaloneUrl: '/invulhulpen/',
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) }),
      )

      const { loadConfig, getConfig } = await freshModule()
      await loadConfig()

      expect(getConfig()).toEqual(payload)
    })
  })
})

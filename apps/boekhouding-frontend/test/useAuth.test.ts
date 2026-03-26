/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock keycloak instance
const mockKeycloak = {
  init: vi.fn().mockResolvedValue(true),
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateToken: vi.fn().mockResolvedValue(true),
  authenticated: true,
  token: 'mock-access-token',
  subject: 'user-123',
  tokenParsed: {
    sub: 'user-123',
    email: 'sam@example.com',
    name: 'Sam van der Berg',
  },
  onTokenExpired: null as (() => void) | null,
  onAuthRefreshError: null as (() => void) | null,
}

// Keycloak default export is a class — mock it as a constructor
vi.mock('keycloak-js', () => ({
  default: function MockKeycloak() { return mockKeycloak },
}))

vi.mock('../src/config', () => ({
  getConfig: () => ({
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'test-realm',
    keycloakClientId: 'test-client',
  }),
}))

let useAuth: typeof import('../src/composables/useAuth').useAuth
let SessionExpiredError: typeof import('../src/composables/useAuth').SessionExpiredError

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const mod = await import('../src/composables/useAuth')
  useAuth = mod.useAuth
  SessionExpiredError = mod.SessionExpiredError

  // Reset mock state
  mockKeycloak.authenticated = true
  mockKeycloak.token = 'mock-access-token'
  mockKeycloak.init.mockResolvedValue(true)
  mockKeycloak.updateToken.mockResolvedValue(true)
  mockKeycloak.login.mockResolvedValue(undefined)
  mockKeycloak.onTokenExpired = null
  mockKeycloak.onAuthRefreshError = null
})

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
})

describe('useAuth', () => {
  describe('init()', () => {
    it('sets up onTokenExpired and onAuthRefreshError callbacks after authentication', async () => {
      const { init } = useAuth()
      await init()

      expect(mockKeycloak.onTokenExpired).toBeTypeOf('function')
      expect(mockKeycloak.onAuthRefreshError).toBeTypeOf('function')
    })

    it('starts background refresh interval after authentication', async () => {
      const { init } = useAuth()
      await init()

      mockKeycloak.updateToken.mockClear()
      vi.advanceTimersByTime(240_000)

      expect(mockKeycloak.updateToken).toHaveBeenCalledWith(70)
    })

    it('does not set up callbacks if not authenticated', async () => {
      mockKeycloak.authenticated = false
      mockKeycloak.init.mockResolvedValue(false)

      const { init } = useAuth()
      await init()

      expect(mockKeycloak.onTokenExpired).toBeNull()
      expect(mockKeycloak.onAuthRefreshError).toBeNull()
    })
  })

  describe('getToken()', () => {
    it('returns the current token after refreshing', async () => {
      const { init, getToken } = useAuth()
      await init()

      const token = await getToken()
      expect(token).toBe('mock-access-token')
      expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30)
    })

    it('throws SessionExpiredError when sessionExpired is already true', async () => {
      const { init, getToken, sessionExpired } = useAuth()
      await init()

      sessionExpired.value = true

      await expect(getToken()).rejects.toThrow(SessionExpiredError)
    })

    it('sets sessionExpired and throws when updateToken fails', async () => {
      const { init, getToken, sessionExpired } = useAuth()
      await init()

      mockKeycloak.updateToken.mockRejectedValueOnce(new Error('refresh failed'))

      await expect(getToken()).rejects.toThrow(SessionExpiredError)
      expect(sessionExpired.value).toBe(true)
    })
  })

  describe('onTokenExpired callback', () => {
    it('attempts token refresh when access token expires', async () => {
      const { init } = useAuth()
      await init()

      mockKeycloak.updateToken.mockClear()
      mockKeycloak.onTokenExpired!()

      expect(mockKeycloak.updateToken).toHaveBeenCalledWith(70)
    })

    it('sets sessionExpired when refresh fails', async () => {
      const { init, sessionExpired } = useAuth()
      await init()

      mockKeycloak.updateToken.mockRejectedValueOnce(new Error('refresh token expired'))
      mockKeycloak.onTokenExpired!()

      await vi.waitFor(() => {
        expect(sessionExpired.value).toBe(true)
      })
    })
  })

  describe('onAuthRefreshError callback', () => {
    it('sets sessionExpired to true', async () => {
      const { init, sessionExpired } = useAuth()
      await init()

      mockKeycloak.onAuthRefreshError!()

      expect(sessionExpired.value).toBe(true)
    })
  })

  describe('background refresh interval', () => {
    it('sets sessionExpired when background refresh fails', async () => {
      const { init, sessionExpired } = useAuth()
      await init()

      mockKeycloak.updateToken.mockRejectedValue(new Error('expired'))
      vi.advanceTimersByTime(240_000)

      await vi.waitFor(() => {
        expect(sessionExpired.value).toBe(true)
      })
    })
  })

  describe('relogin()', () => {
    it('saves relogin marker to sessionStorage with userId', async () => {
      const { init, relogin } = useAuth()
      await init()

      await relogin()

      const marker = JSON.parse(sessionStorage.getItem('auth:relogin')!)
      expect(marker.userId).toBe('user-123')
    })

    it('calls keycloak.login with current page URL as redirectUri', async () => {
      const { init, relogin } = useAuth()
      await init()

      await relogin()

      expect(mockKeycloak.login).toHaveBeenCalledWith({
        redirectUri: expect.any(String),
      })
    })
  })
})

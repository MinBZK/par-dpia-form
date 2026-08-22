/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockKeycloak = {
  init: vi.fn().mockResolvedValue(true),
  login: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  updateToken: vi.fn().mockResolvedValue(true),
  authenticated: true as boolean,
  token: 'mock-access-token' as string | undefined,
  subject: 'user-123' as string | undefined,
  tokenParsed: {} as Record<string, unknown>,
  onTokenExpired: null as (() => void) | null,
  onAuthRefreshError: null as (() => void) | null,
}

// Keycloak's default export is a class, so the mock must be a constructor.
vi.mock('keycloak-js', () => ({
  default: function MockKeycloak() {
    return mockKeycloak
  },
}))

vi.mock('../../src/config', () => ({
  getConfig: () => ({
    keycloakUrl: 'http://localhost:8080',
    keycloakRealm: 'test-realm',
    keycloakClientId: 'test-client',
  }),
}))

let useAuth: typeof import('../../src/composables/useAuth').useAuth
let SessionExpiredError: typeof import('../../src/composables/useAuth').SessionExpiredError

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  const mod = await import('../../src/composables/useAuth')
  useAuth = mod.useAuth
  SessionExpiredError = mod.SessionExpiredError

  mockKeycloak.authenticated = true
  mockKeycloak.token = 'mock-access-token'
  mockKeycloak.subject = 'user-123'
  mockKeycloak.tokenParsed = {
    sub: 'user-123',
    email: 'sam@example.com',
    name: 'Sam van der Berg',
    preferred_username: 'sam',
  }
  mockKeycloak.init.mockReset().mockResolvedValue(true)
  mockKeycloak.updateToken.mockReset().mockResolvedValue(true)
  mockKeycloak.login.mockReset().mockResolvedValue(undefined)
  mockKeycloak.logout.mockReset().mockResolvedValue(undefined)
  mockKeycloak.onTokenExpired = null
  mockKeycloak.onAuthRefreshError = null
})

afterEach(() => {
  vi.useRealTimers()
  sessionStorage.clear()
  localStorage.clear()
})

describe('SessionExpiredError', () => {
  it('has the Dutch message and SessionExpiredError name', () => {
    const err = new SessionExpiredError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Sessie verlopen')
    expect(err.name).toBe('SessionExpiredError')
  })
})

describe('isAuthenticated computed', () => {
  it('is false before init() because keycloak is undefined (optional chaining short-circuit)', () => {
    const { isAuthenticated } = useAuth()
    expect(isAuthenticated.value).toBe(false)
  })

  it('is true when keycloak.authenticated === true', async () => {
    const { init, isAuthenticated } = useAuth()
    await init()
    expect(isAuthenticated.value).toBe(true)
  })

  it('is false when keycloak.authenticated is not strictly true', async () => {
    mockKeycloak.authenticated = false
    mockKeycloak.init.mockResolvedValue(false)
    const { init, isAuthenticated } = useAuth()
    await init()
    expect(isAuthenticated.value).toBe(false)
  })
})

describe('init()', () => {
  it('populates user from a full token profile', async () => {
    const { init, user } = useAuth()
    await init()

    expect(user.value).toEqual({
      id: 'user-123',
      email: 'sam@example.com',
      displayName: 'Sam van der Berg',
    })
  })

  it('falls back to preferred_username for displayName when name is missing', async () => {
    mockKeycloak.tokenParsed = {
      sub: 'user-123',
      email: 'sam@example.com',
      preferred_username: 'sam',
    }
    const { init, user } = useAuth()
    await init()
    expect(user.value?.displayName).toBe('sam')
  })

  it('falls back to email for displayName when name and preferred_username are missing', async () => {
    mockKeycloak.tokenParsed = {
      sub: 'user-123',
      email: 'sam@example.com',
    }
    const { init, user } = useAuth()
    await init()
    expect(user.value?.displayName).toBe('sam@example.com')
  })

  it('uses empty strings for all fields when token profile is empty', async () => {
    mockKeycloak.tokenParsed = {}
    const { init, user } = useAuth()
    await init()
    expect(user.value).toEqual({ id: '', email: '', displayName: '' })
  })

  it('sets up onTokenExpired and onAuthRefreshError callbacks and starts the refresh interval', async () => {
    const { init } = useAuth()
    await init()

    expect(mockKeycloak.onTokenExpired).toBeTypeOf('function')
    expect(mockKeycloak.onAuthRefreshError).toBeTypeOf('function')

    mockKeycloak.updateToken.mockClear()
    vi.advanceTimersByTime(240_000)
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(70)
  })

  it('initialises Keycloak with POST as the logout method', async () => {
    const { init } = useAuth()
    await init()

    expect(mockKeycloak.init).toHaveBeenCalledWith(
      expect.objectContaining({ logoutMethod: 'POST' }),
    )
  })

  it('does not set up callbacks when keycloak.init resolves false (unauthenticated)', async () => {
    mockKeycloak.authenticated = false
    mockKeycloak.init.mockResolvedValue(false)

    const { init } = useAuth()
    await init()

    expect(mockKeycloak.onTokenExpired).toBeNull()
    expect(mockKeycloak.onAuthRefreshError).toBeNull()
  })

  it('returns early on a second init() call (initialized guard)', async () => {
    const { init } = useAuth()
    await init()

    mockKeycloak.init.mockClear()
    await init()

    expect(mockKeycloak.init).not.toHaveBeenCalled()
  })
})

describe('refreshOrExpire (onTokenExpired callback)', () => {
  it('refreshes the token successfully without flagging sessionExpired', async () => {
    const { init, sessionExpired } = useAuth()
    await init()

    mockKeycloak.updateToken.mockClear()
    mockKeycloak.updateToken.mockResolvedValueOnce(true)
    mockKeycloak.onTokenExpired!()
    // Flush the .catch() microtask without advancing the background setInterval (it never stops).
    await Promise.resolve()

    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(70)
    expect(sessionExpired.value).toBe(false)
  })

  it('sets sessionExpired when the token refresh rejects', async () => {
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

describe('login()', () => {
  it('redirects to /projecten on the current origin', async () => {
    const { init, login } = useAuth()
    await init()

    await login()

    expect(mockKeycloak.login).toHaveBeenCalledWith({
      redirectUri: `${window.location.origin}/projecten`,
    })
  })
})

describe('getToken()', () => {
  it('returns the current token after a successful refresh', async () => {
    const { init, getToken } = useAuth()
    await init()

    const token = await getToken()
    expect(token).toBe('mock-access-token')
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30)
  })

  it('throws SessionExpiredError immediately when sessionExpired is already true', async () => {
    const { init, getToken, sessionExpired } = useAuth()
    await init()

    sessionExpired.value = true

    await expect(getToken()).rejects.toThrow(SessionExpiredError)
  })

  it('sets sessionExpired and throws SessionExpiredError when updateToken rejects', async () => {
    const { init, getToken, sessionExpired } = useAuth()
    await init()

    mockKeycloak.updateToken.mockRejectedValueOnce(new Error('refresh failed'))

    await expect(getToken()).rejects.toThrow(SessionExpiredError)
    expect(sessionExpired.value).toBe(true)
  })
})

describe('relogin()', () => {
  it('stores a relogin marker with the keycloak subject and re-logs in to the current URL', async () => {
    const { init, relogin } = useAuth()
    await init()

    await relogin()

    const marker = JSON.parse(sessionStorage.getItem('auth:relogin')!)
    expect(marker.userId).toBe('user-123')
    expect(mockKeycloak.login).toHaveBeenCalledWith({
      redirectUri: window.location.href,
    })
  })
})

describe('logout()', () => {
  // The browser applies Clear-Site-Data but does not expose the header to
  // script, so only the request itself is observable here. That the header
  // actually clears storage was verified against a real browser.
  it('asks the server to clear site data before redirecting to Keycloak', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { init, logout } = useAuth()
    await init()
    await logout()

    expect(fetchSpy).toHaveBeenCalledWith(
      '/clear-site-data',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(mockKeycloak.logout).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('still logs out when that request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const { init, logout } = useAuth()
    await init()
    await logout()

    expect(mockKeycloak.logout).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('clears the refresh interval when one is active, then logs out', async () => {
    const { init, logout } = useAuth()
    await init()

    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    await logout()

    expect(clearSpy).toHaveBeenCalled()
    expect(mockKeycloak.logout).toHaveBeenCalledWith({
      redirectUri: window.location.origin,
    })

    clearSpy.mockClear()
    await logout()
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('logs out without clearing an interval when none was started (unauthenticated init)', async () => {
    mockKeycloak.authenticated = false
    mockKeycloak.init.mockResolvedValue(false)

    const { init, logout } = useAuth()
    await init()

    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    await logout()

    expect(clearSpy).not.toHaveBeenCalled()
    expect(mockKeycloak.logout).toHaveBeenCalledWith({
      redirectUri: window.location.origin,
    })
  })

  it('removes every key a session leaves behind, and nothing else', async () => {
    localStorage.setItem('ui:assessment-1', '{"currentRootTaskId":"1"}')
    localStorage.setItem('ui:assessment-2', '{"currentRootTaskId":"2"}')
    // Written by keycloak-js: OAuth callback state including the PKCE verifier.
    localStorage.setItem('kc-callback-abc123', '{"pkceCodeVerifier":"secret"}')
    localStorage.setItem('unrelated', 'keep-me')
    sessionStorage.setItem('pending:assessment-1', '[]')
    sessionStorage.setItem('pending:assessment-2', '[]')
    sessionStorage.setItem('auth:relogin', '{"userId":"user-123"}')
    sessionStorage.setItem('unrelated', 'keep-me-too')

    const { init, logout } = useAuth()
    await init()
    await logout()

    expect(localStorage.getItem('ui:assessment-1')).toBeNull()
    expect(localStorage.getItem('ui:assessment-2')).toBeNull()
    expect(localStorage.getItem('kc-callback-abc123')).toBeNull()
    expect(sessionStorage.getItem('pending:assessment-1')).toBeNull()
    expect(sessionStorage.getItem('pending:assessment-2')).toBeNull()
    expect(sessionStorage.getItem('auth:relogin')).toBeNull()

    expect(localStorage.getItem('unrelated')).toBe('keep-me')
    expect(sessionStorage.getItem('unrelated')).toBe('keep-me-too')
  })

  it('is a no-op on storage when there is nothing to clear', async () => {
    const { init, logout } = useAuth()
    await init()

    await expect(logout()).resolves.toBeUndefined()
  })
})

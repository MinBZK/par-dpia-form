/**
 * @vitest-environment jsdom
 *
 * Self-sufficient coverage test for src/composables/useAuth.ts.
 * Exercises every statement, branch, function and line: the SessionExpiredError
 * class, the isAuthenticated computed (including the keycloak-undefined
 * short-circuit), init() (early return + authenticated/unauthenticated paths +
 * every profile-fallback branch), the refreshOrExpire success/failure paths,
 * login(), getToken() (all three branches), relogin() and logout() (interval
 * set + not-set).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mutable keycloak mock — every test resets the relevant fields in beforeEach.
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

// Keycloak default export is a class — mock it as a constructor.
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

  // Reset mock to a fully-authenticated baseline with a complete profile.
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
    // keycloak has not been assigned yet → keycloak?.authenticated is undefined.
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

    // The guard returns before constructing/initialising Keycloak again.
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
    // Flush the microtask queue (the .catch() handler) without advancing the
    // background setInterval, which would otherwise loop forever.
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
  it('clears the refresh interval when one is active, then logs out', async () => {
    const { init, logout } = useAuth()
    await init()

    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    await logout()

    expect(clearSpy).toHaveBeenCalled()
    expect(mockKeycloak.logout).toHaveBeenCalledWith({
      redirectUri: window.location.origin,
    })

    // A subsequent logout finds refreshInterval already null and skips the clear.
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
})

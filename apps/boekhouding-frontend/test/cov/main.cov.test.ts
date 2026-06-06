/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// main.ts is a side-effecting bootstrap module with top-level await. To cover
// every branch we mock all of its dependencies, set up the relevant browser
// state (location hash, sessionStorage, history), then dynamically import the
// module fresh per test via vi.resetModules().

// --- Mocks ---------------------------------------------------------------

const mockInit = vi.fn().mockResolvedValue(undefined)
// user is a ref-like { value } object as returned by useAuth().
const mockUser = { value: null as null | { id: string } }

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({ init: mockInit, user: mockUser }),
}))

const mockLoadConfig = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/config', () => ({
  loadConfig: mockLoadConfig,
}))

// App.vue — replace with a trivial component so Vue can mount it.
vi.mock('../../src/App.vue', () => ({
  default: { name: 'App', render: () => null },
}))

// router is dynamically imported inside main.ts after the URL is cleaned.
const mockRouter = { install: vi.fn() }
vi.mock('../../src/router', () => ({
  router: mockRouter,
}))

// useSchemaStore comes from the workspace core package.
const mockUseSchemaStore = vi.fn(() => ({}))
vi.mock('@overheid-assessment/core', () => ({
  useSchemaStore: mockUseSchemaStore,
}))

// Vue: spy on createApp so we can assert the mount/use chain without needing
// a real DOM-bound application instance.
const mockApp = {
  use: vi.fn(function (this: unknown) { return mockApp }),
  mount: vi.fn(),
}
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, createApp: vi.fn(() => mockApp) }
})

const mockPinia = { __isPinia: true }
vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return { ...actual, createPinia: vi.fn(() => mockPinia) }
})

// Static CSS asset imports — no executable code, but they must resolve.
vi.mock('@nl-rvo/assets/fonts/index.css', () => ({}))
vi.mock('@nl-rvo/assets/icons/index.css', () => ({}))
vi.mock('@nl-rvo/assets/images/index.css', () => ({}))
vi.mock('@nl-rvo/component-library-css/dist/index.css', () => ({}))
vi.mock('@nl-rvo/design-tokens/dist/index.css', () => ({}))
vi.mock('../../src/assets/app.css', () => ({}))

// --- Test helpers --------------------------------------------------------

let hrefSetter: ((v: string) => void) | undefined
let replaceStateSpy: ReturnType<typeof vi.spyOn>

/**
 * Configure window.location for a test. jsdom forbids reassigning
 * window.location, so we redefine it with a controllable href setter.
 */
function setupLocation(opts: { hash?: string; pathname?: string; search?: string }) {
  const hash = opts.hash ?? ''
  const pathname = opts.pathname ?? '/'
  const search = opts.search ?? ''
  hrefSetter = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hash,
      pathname,
      search,
      set href(v: string) { hrefSetter!(v) },
      get href() { return pathname + search + hash },
    },
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  sessionStorage.clear()

  mockUser.value = null
  mockInit.mockResolvedValue(undefined)
  mockLoadConfig.mockResolvedValue(undefined)

  // Default clean location: no OAuth hash.
  setupLocation({ hash: '', pathname: '/projecten' })

  // Spy on history.replaceState (jsdom implements it).
  replaceStateSpy = vi.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceStateSpy.mockRestore()
})

// Importing main.ts executes its top-level code (including top-level await).
async function importMain() {
  await import('../../src/main')
}

describe('main.ts bootstrap', () => {
  describe('config and auth initialisation', () => {
    it('loads config and initialises auth before mounting', async () => {
      await importMain()

      expect(mockLoadConfig).toHaveBeenCalledTimes(1)
      expect(mockInit).toHaveBeenCalledTimes(1)
      // App is mounted onto #app.
      expect(mockApp.mount).toHaveBeenCalledWith('#app')
      // pinia, router and schema store are wired up.
      expect(mockApp.use).toHaveBeenCalledWith(mockPinia)
      expect(mockApp.use).toHaveBeenCalledWith(mockRouter)
      expect(mockUseSchemaStore).toHaveBeenCalledWith(mockPinia)
    })
  })

  describe('OAuth hash cleanup (line 22)', () => {
    it('strips the OAuth state hash when present', async () => {
      setupLocation({
        hash: '#state=abc&session_state=xyz',
        pathname: '/projecten',
        search: '?foo=bar',
      })

      await importMain()

      expect(replaceStateSpy).toHaveBeenCalledWith(
        window.history.state,
        '',
        '/projecten?foo=bar',
      )
    })

    it('leaves the URL untouched when there is no OAuth state hash', async () => {
      setupLocation({ hash: '#section', pathname: '/projecten' })

      await importMain()

      expect(replaceStateSpy).not.toHaveBeenCalled()
    })
  })

  describe('relogin handling (lines 26-39)', () => {
    it('does nothing when there is no relogin marker', async () => {
      // No sessionStorage entry — reloginRaw is null.
      await importMain()

      expect(hrefSetter).not.toHaveBeenCalled()
      // Marker remains absent.
      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
    })

    it('clears pending keys and redirects when the user changed', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'old-user' }))
      sessionStorage.setItem('pending:project-1', 'data-1')
      sessionStorage.setItem('pending:project-2', 'data-2')
      sessionStorage.setItem('keep:me', 'untouched')
      mockUser.value = { id: 'new-user' }

      await importMain()

      // Relogin marker is always removed once read.
      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      // pending:* keys are cleared.
      expect(sessionStorage.getItem('pending:project-1')).toBeNull()
      expect(sessionStorage.getItem('pending:project-2')).toBeNull()
      // Other keys are preserved.
      expect(sessionStorage.getItem('keep:me')).toBe('untouched')
      // Redirected to /projecten.
      expect(hrefSetter).toHaveBeenCalledWith('/projecten')
    })

    it('removes the marker but does not redirect when the user is unchanged', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'same-user' }))
      sessionStorage.setItem('pending:project-1', 'data-1')
      mockUser.value = { id: 'same-user' }

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      // user.id === previousUserId so the branch short-circuits: no clearing, no redirect.
      expect(sessionStorage.getItem('pending:project-1')).toBe('data-1')
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('does not redirect when there is no authenticated user', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'old-user' }))
      mockUser.value = null

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      // user.value is null → first condition false → no redirect.
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('does not redirect when the stored marker has no userId', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ somethingElse: true }))
      mockUser.value = { id: 'new-user' }

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      // previousUserId is undefined → second condition false → no redirect.
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('ignores a malformed relogin marker without throwing', async () => {
      sessionStorage.setItem('auth:relogin', 'not-json{')
      mockUser.value = { id: 'new-user' }

      // JSON.parse throws → caught by the try/catch (line 38).
      await expect(importMain()).resolves.toBeUndefined()
      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('preserves non-pending keys while iterating sessionStorage', async () => {
      // Exercises the key?.startsWith('pending:') optional-chaining branch with
      // a mix of matching and non-matching keys.
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'old-user' }))
      sessionStorage.setItem('other:thing', 'value')
      sessionStorage.setItem('pending:x', 'gone')
      mockUser.value = { id: 'fresh-user' }

      await importMain()

      expect(sessionStorage.getItem('other:thing')).toBe('value')
      expect(sessionStorage.getItem('pending:x')).toBeNull()
      expect(hrefSetter).toHaveBeenCalledWith('/projecten')
    })
  })
})

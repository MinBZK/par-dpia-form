/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// main.ts has top-level await and is re-imported fresh per test via
// vi.resetModules(); every dependency is mocked so the bootstrap can run.

const mockInit = vi.fn().mockResolvedValue(undefined)
const mockUser = { value: null as null | { id: string } }

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({ init: mockInit, user: mockUser }),
}))

const mockLoadConfig = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/config', () => ({
  loadConfig: mockLoadConfig,
}))

vi.mock('../../src/App.vue', () => ({
  default: { name: 'App', render: () => null },
}))

const mockRouter = { install: vi.fn() }
vi.mock('../../src/router', () => ({
  router: mockRouter,
}))

const mockUseSchemaStore = vi.fn(() => ({}))
vi.mock('@overheid-assessment/core', () => ({
  useSchemaStore: mockUseSchemaStore,
}))

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

// CSS asset imports carry no logic but must still resolve.
vi.mock('@nl-rvo/assets/fonts/index.css', () => ({}))
vi.mock('@nl-rvo/assets/icons/index.css', () => ({}))
vi.mock('@nl-rvo/assets/images/index.css', () => ({}))
vi.mock('@nl-rvo/component-library-css/dist/index.css', () => ({}))
vi.mock('@nl-rvo/design-tokens/dist/index.css', () => ({}))
vi.mock('../../src/assets/app.css', () => ({}))

let hrefSetter: ((v: string) => void) | undefined
let replaceStateSpy: ReturnType<typeof vi.spyOn>

function setupLocation(opts: { hash?: string; pathname?: string; search?: string }) {
  const hash = opts.hash ?? ''
  const pathname = opts.pathname ?? '/'
  const search = opts.search ?? ''
  hrefSetter = vi.fn()
  // jsdom forbids reassigning window.location, so redefine it with a controllable href setter.
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

  setupLocation({ hash: '', pathname: '/projecten' })

  replaceStateSpy = vi.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceStateSpy.mockRestore()
})

async function importMain() {
  await import('../../src/main')
}

describe('main.ts bootstrap', () => {
  describe('config and auth initialisation', () => {
    it('loads config and initialises auth before mounting', async () => {
      await importMain()

      expect(mockLoadConfig).toHaveBeenCalledTimes(1)
      expect(mockInit).toHaveBeenCalledTimes(1)
      expect(mockApp.mount).toHaveBeenCalledWith('#app')
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
      await importMain()

      expect(hrefSetter).not.toHaveBeenCalled()
      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
    })

    it('clears pending keys and redirects when the user changed', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'sam@example.com' }))
      sessionStorage.setItem('pending:project-1', 'data-1')
      sessionStorage.setItem('pending:project-2', 'data-2')
      sessionStorage.setItem('keep:me', 'untouched')
      mockUser.value = { id: 'noor@example.com' }

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(sessionStorage.getItem('pending:project-1')).toBeNull()
      expect(sessionStorage.getItem('pending:project-2')).toBeNull()
      expect(sessionStorage.getItem('keep:me')).toBe('untouched')
      expect(hrefSetter).toHaveBeenCalledWith('/projecten')
    })

    it('removes the marker but does not redirect when the user is unchanged', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'sam@example.com' }))
      sessionStorage.setItem('pending:project-1', 'data-1')
      mockUser.value = { id: 'sam@example.com' }

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(sessionStorage.getItem('pending:project-1')).toBe('data-1')
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('does not redirect when there is no authenticated user', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'sam@example.com' }))
      mockUser.value = null

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('does not redirect when the stored marker has no userId', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ somethingElse: true }))
      mockUser.value = { id: 'noor@example.com' }

      await importMain()

      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('ignores a malformed relogin marker without throwing', async () => {
      sessionStorage.setItem('auth:relogin', 'not-json{')
      mockUser.value = { id: 'noor@example.com' }

      await expect(importMain()).resolves.toBeUndefined()
      expect(sessionStorage.getItem('auth:relogin')).toBeNull()
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('preserves non-pending keys while iterating sessionStorage', async () => {
      sessionStorage.setItem('auth:relogin', JSON.stringify({ userId: 'sam@example.com' }))
      sessionStorage.setItem('other:thing', 'value')
      sessionStorage.setItem('pending:x', 'gone')
      mockUser.value = { id: 'noor@example.com' }

      await importMain()

      expect(sessionStorage.getItem('other:thing')).toBe('value')
      expect(sessionStorage.getItem('pending:x')).toBeNull()
      expect(hrefSetter).toHaveBeenCalledWith('/projecten')
    })
  })
})

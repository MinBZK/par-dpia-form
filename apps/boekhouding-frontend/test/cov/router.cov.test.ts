/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'

// Auth state controllable per test. The router guard reads
// `isAuthenticated.value` and may call `login()`.
const mockIsAuthenticated = { value: true }
const mockLogin = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    login: mockLogin,
  }),
}))

// Stub every view component so the lazy `() => import(...)` route loaders
// resolve to a trivial module instead of pulling in heavy SFC dependencies.
// Each stub is distinguishable so we can assert the right loader was invoked.
function stub(name: string) {
  return { default: { name } }
}
vi.mock('../../src/views/LandingPage.vue', () => stub('LandingPage'))
vi.mock('../../src/views/ProjectList.vue', () => stub('ProjectList'))
vi.mock('../../src/views/ProjectDetail.vue', () => stub('ProjectDetail'))
vi.mock('../../src/views/ProjectMembers.vue', () => stub('ProjectMembers'))
vi.mock('../../src/views/AssessmentEditor.vue', () => stub('AssessmentEditor'))
vi.mock('../../src/views/VersionHistory.vue', () => stub('VersionHistory'))
vi.mock('../../src/views/PrivacyStatement.vue', () => stub('PrivacyStatement'))
vi.mock('../../src/views/AccessibilityStatement.vue', () => stub('AccessibilityStatement'))
vi.mock('../../src/views/AboutAssessments.vue', () => stub('AboutAssessments'))

let router: typeof import('../../src/router').router

beforeEach(async () => {
  vi.resetModules()
  mockIsAuthenticated.value = true
  mockLogin.mockClear()
  mockLogin.mockResolvedValue(undefined)
  const mod = await import('../../src/router')
  router = mod.router
})

// Helper: pull the flat list of route records the router was built with.
function records(): RouteRecordRaw[] {
  return router.getRoutes() as unknown as RouteRecordRaw[]
}

// Helper: find a record by name.
function byName(name: string) {
  const rec = router.getRoutes().find((r) => r.name === name)
  if (!rec) throw new Error(`route ${name} not found`)
  return rec
}

describe('router route table', () => {
  it('registers every named route with its path', () => {
    const paths = new Map(router.getRoutes().map((r) => [r.name, r.path]))
    expect(paths.get('home')).toBe('/')
    expect(paths.get('projects')).toBe('/projecten')
    expect(paths.get('project')).toBe('/project/:projectId')
    expect(paths.get('members')).toBe('/project/:projectId/leden')
    expect(paths.get('assessment-editor')).toBe('/assessment/:assessmentId')
    expect(paths.get('version-history')).toBe('/assessment/:assessmentId/versies')
    expect(paths.get('privacy')).toBe('/privacy')
    expect(paths.get('accessibility')).toBe('/toegankelijkheid')
    expect(paths.get('about')).toBe('/over')
  })

  it('marks the public routes with meta.public and leaves the rest unset', () => {
    expect(byName('home').meta?.public).toBe(true)
    expect(byName('privacy').meta?.public).toBe(true)
    expect(byName('accessibility').meta?.public).toBe(true)
    expect(byName('about').meta?.public).toBe(true)

    // Protected routes do not carry the public flag.
    expect(byName('projects').meta?.public).toBeUndefined()
    expect(byName('project').meta?.public).toBeUndefined()
    expect(byName('assessment-editor').meta?.public).toBeUndefined()
  })

  it('invokes every lazy component loader and resolves the stubbed module', async () => {
    // Calling each `component: () => import(...)` exercises the arrow
    // functions declared in the routes array (function coverage) and proves
    // each route points at the expected view module.
    const expected: Record<string, string> = {
      home: 'LandingPage',
      projects: 'ProjectList',
      project: 'ProjectDetail',
      members: 'ProjectMembers',
      'assessment-editor': 'AssessmentEditor',
      'version-history': 'VersionHistory',
      privacy: 'PrivacyStatement',
      accessibility: 'AccessibilityStatement',
      about: 'AboutAssessments',
    }

    for (const [name, componentName] of Object.entries(expected)) {
      const rec = byName(name)
      const loader = (rec as unknown as { components?: { default: unknown } }).components
        ?.default as () => Promise<{ default: { name: string } }>
      expect(typeof loader).toBe('function')
      const mod = await loader()
      expect(mod.default.name).toBe(componentName)
    }
  })

  it('passes route params as props for parametrised routes', () => {
    // The four routes declared with `props: true` should expose props=true.
    for (const name of ['project', 'members', 'assessment-editor', 'version-history']) {
      const rec = byName(name)
      // vue-router stores per-named-view props; the default view should be true.
      const props = (rec as unknown as { props: Record<string, unknown> }).props
      expect(props.default).toBe(true)
    }
  })
})

describe('router beforeEach guard', () => {
  it('allows navigation to a public route without checking auth', async () => {
    mockIsAuthenticated.value = false // even when unauthenticated
    await router.push('/privacy')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('privacy')
    // Public short-circuit: login must never be called.
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('allows navigation to a protected route when authenticated', async () => {
    mockIsAuthenticated.value = true
    await router.push('/projecten')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('projects')
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('blocks a protected route and triggers login when unauthenticated', async () => {
    mockIsAuthenticated.value = false

    // The guard returns false, aborting the navigation. vue-router reports
    // this as a NavigationFailure rather than a rejection.
    const failure = await router.push('/projecten')

    expect(mockLogin).toHaveBeenCalledTimes(1)
    // Navigation was aborted, so we did not land on the projects route.
    expect(router.currentRoute.value.name).not.toBe('projects')
    expect(failure).toBeTruthy()
  })
})

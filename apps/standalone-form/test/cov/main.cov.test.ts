/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// src/main.ts is a side-effecting bootstrap module: importing it creates the
// Vue app, wires up Pinia, initialises the schema store with the generated
// DPIA/PreScan JSON, and mounts onto #app. There are no branches, so a single
// fresh import is enough to cover every line — but we mock all dependencies so
// the test asserts the exact wiring chain without rendering the real App.vue
// (and its heavy children / CSS).

// --- Mocks ---------------------------------------------------------------

// App.vue — replace with a trivial component so createApp has something to use.
const fakeApp = { name: 'App', render: () => null }
vi.mock('../../src/App.vue', () => ({ default: fakeApp }))

// The generated DPIA/PreScan JSON are imported by main.ts and passed straight
// through to schemaStore.init(). We leave them un-mocked (Vite resolves the
// real source files) and assert on their identity / structure below.

// useSchemaStore comes from the workspace core package. Returns an object with
// a spy-able init().
const mockInit = vi.fn()
const mockSchemaStore = { init: mockInit }
const mockUseSchemaStore = vi.fn(() => mockSchemaStore)
vi.mock('@overheid-assessment/core', () => ({
  useSchemaStore: mockUseSchemaStore,
}))

// Vue: spy on createApp so we can assert the use/mount chain without binding a
// real application instance to the DOM.
const mockApp = {
  use: vi.fn(function (this: unknown) {
    return mockApp
  }),
  mount: vi.fn(),
}
const mockCreateApp = vi.fn(() => mockApp)
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return { ...actual, createApp: mockCreateApp }
})

// Pinia: spy on createPinia so we can assert it is the instance threaded
// through app.use() and useSchemaStore().
const mockPinia = { __isPinia: true }
const mockCreatePinia = vi.fn(() => mockPinia)
vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return { ...actual, createPinia: mockCreatePinia }
})

// --- Test helpers --------------------------------------------------------

// Importing main.ts executes its top-level bootstrap code.
async function importMain() {
  await import('../../src/main')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('main.ts bootstrap', () => {
  it('creates the app from App.vue and a fresh pinia, then mounts onto #app', async () => {
    await importMain()

    // App is created from the App.vue default export.
    expect(mockCreateApp).toHaveBeenCalledTimes(1)
    expect(mockCreateApp).toHaveBeenCalledWith(fakeApp)

    // A pinia instance is created and installed on the app.
    expect(mockCreatePinia).toHaveBeenCalledTimes(1)
    expect(mockApp.use).toHaveBeenCalledTimes(1)
    expect(mockApp.use).toHaveBeenCalledWith(mockPinia)

    // The app is mounted onto the #app element.
    expect(mockApp.mount).toHaveBeenCalledTimes(1)
    expect(mockApp.mount).toHaveBeenCalledWith('#app')
  })

  it('resolves the schema store against the created pinia and initialises it with both schemas', async () => {
    await importMain()

    // useSchemaStore is called with the same pinia instance.
    expect(mockUseSchemaStore).toHaveBeenCalledTimes(1)
    expect(mockUseSchemaStore).toHaveBeenCalledWith(mockPinia)

    // init() receives the generated DPIA + PreScan JSON under the expected keys.
    expect(mockInit).toHaveBeenCalledTimes(1)
    const initArg = mockInit.mock.calls[0][0] as { dpia: unknown; preScan: unknown }
    expect(Object.keys(initArg).sort()).toEqual(['dpia', 'preScan'])
    // The real generated schemas carry an urn — assert structure rather than
    // exact contents so the test is not coupled to the schema text.
    expect(initArg.dpia).toMatchObject({ urn: expect.any(String) })
    expect(initArg.preScan).toMatchObject({ urn: expect.any(String) })
  })

  it('wires pinia before resolving the schema store (use → store → mount order)', async () => {
    await importMain()

    // The store init must run before mounting so the schemas are available to
    // App.vue. Assert ordering via mock invocation call counts at mount time.
    const useOrder = mockApp.use.mock.invocationCallOrder[0]
    const storeOrder = mockUseSchemaStore.mock.invocationCallOrder[0]
    const initOrder = mockInit.mock.invocationCallOrder[0]
    const mountOrder = mockApp.mount.mock.invocationCallOrder[0]

    expect(useOrder).toBeLessThan(storeOrder)
    expect(storeOrder).toBeLessThan(initOrder)
    expect(initOrder).toBeLessThan(mountOrder)
  })
})

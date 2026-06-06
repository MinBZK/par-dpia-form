/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeApp = { name: 'App', render: () => null }
vi.mock('../../src/App.vue', () => ({ default: fakeApp }))

// DPIA/PreScan JSON are deliberately left un-mocked so Vite resolves the real generated source files.

const mockInit = vi.fn()
const mockSchemaStore = { init: mockInit }
const mockUseSchemaStore = vi.fn(() => mockSchemaStore)
vi.mock('@overheid-assessment/core', () => ({
  useSchemaStore: mockUseSchemaStore,
}))

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

const mockPinia = { __isPinia: true }
const mockCreatePinia = vi.fn(() => mockPinia)
vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return { ...actual, createPinia: mockCreatePinia }
})

async function importMain() {
  await import('../../src/main')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('main.ts bootstrap', () => {
  it('creates the app from App.vue and a fresh pinia, then mounts onto #app', async () => {
    await importMain()

    expect(mockCreateApp).toHaveBeenCalledTimes(1)
    expect(mockCreateApp).toHaveBeenCalledWith(fakeApp)

    expect(mockCreatePinia).toHaveBeenCalledTimes(1)
    expect(mockApp.use).toHaveBeenCalledTimes(1)
    expect(mockApp.use).toHaveBeenCalledWith(mockPinia)

    expect(mockApp.mount).toHaveBeenCalledTimes(1)
    expect(mockApp.mount).toHaveBeenCalledWith('#app')
  })

  it('resolves the schema store against the created pinia and initialises it with both schemas', async () => {
    await importMain()

    expect(mockUseSchemaStore).toHaveBeenCalledTimes(1)
    expect(mockUseSchemaStore).toHaveBeenCalledWith(mockPinia)

    expect(mockInit).toHaveBeenCalledTimes(1)
    const initArg = mockInit.mock.calls[0][0] as { dpia: unknown; preScan: unknown }
    expect(Object.keys(initArg).sort()).toEqual(['dpia', 'preScan'])
    expect(initArg.dpia).toMatchObject({ urn: expect.any(String) })
    expect(initArg.preScan).toMatchObject({ urn: expect.any(String) })
  })

  it('wires pinia before resolving the schema store (use → store → mount order)', async () => {
    await importMain()

    const useOrder = mockApp.use.mock.invocationCallOrder[0]
    const storeOrder = mockUseSchemaStore.mock.invocationCallOrder[0]
    const initOrder = mockInit.mock.invocationCallOrder[0]
    const mountOrder = mockApp.mount.mock.invocationCallOrder[0]

    expect(useOrder).toBeLessThan(storeOrder)
    expect(storeOrder).toBeLessThan(initOrder)
    expect(initOrder).toBeLessThan(mountOrder)
  })
})

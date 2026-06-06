import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, type FlatTask } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import {
  importFromJson,
  buildOutputData,
  exportToJson,
  downloadJsonFile,
} from '../../src/utils/jsonExport'
import { OUTPUT_SCHEMA_URL } from '../../src/models/assessmentState'
import { FormType } from '../../src/models/dpia'

// getUrn requires fully loaded schemas (large DPIA JSON). Stub it so the
// exporter has a deterministic urn for each namespace.
vi.mock('../../src/stores/schemas', () => ({
  useSchemaStore: vi.fn(() => ({
    getUrn: (ns: string) => (ns === 'dpia' ? 'urn:nl:dpia:3.0' : 'urn:nl:prescan:2.0'),
  })),
}))

describe('importFromJson', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('parses a valid assessment file into AssessmentState', async () => {
    const payload = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-01-01T00:00:00Z' },
      answers: { '1.1': { value: 'Een beschrijving', lastEditedAt: '2026-01-01T00:00:00Z' } },
    }
    const file = new File([JSON.stringify(payload)], 'assessment.json', {
      type: 'application/json',
    })

    const state = await importFromJson(file)

    expect(state.metadata.urn).toBe('urn:nl:dpia:3.0')
    expect(state.answers['1.1']).toEqual({
      value: 'Een beschrijving',
      lastEditedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('rejects an invalid (non-assessment) file via parseAndValidateImport', async () => {
    const file = new File([JSON.stringify({ foo: 'bar' })], 'broken.json', {
      type: 'application/json',
    })

    await expect(importFromJson(file)).rejects.toThrow(
      'Bestand mist metadata of answers — geen geldig assessment-bestand',
    )
  })
})

describe('buildOutputData', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  it('builds output with schema, urn, createdAt and visible answers', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
      '1.1.1': { value: 'false', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.$schema).toBe(OUTPUT_SCHEMA_URL)
    expect(output.metadata.urn).toBe('urn:nl:prescan:2.0')
    expect(output.metadata.createdAt).toEqual(expect.any(String))
    expect(output.answers['0.1']).toEqual({ value: 'true', lastEditedAt: '2026-01-01' })
    expect(output.answers['1.1.1']).toEqual({ value: 'false', lastEditedAt: '2026-01-01' })
  })

  it('includes sorted completedTasks when sections are complete (truthy branch)', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.completedRootTaskIds[FormType.DPIA] = new Set(['5', '1', '10', '0'])
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'test', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    // Sorted numerically, and the conditional-spread truthy branch is taken.
    expect(output.metadata.completedTasks).toEqual(['0', '1', '5', '10'])
  })

  it('omits completedTasks when no sections are complete (falsy branch)', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'test', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.metadata).not.toHaveProperty('completedTasks')
  })

  it('falls back to empty objects when namespace has no answers or flatTasks', () => {
    // Active namespace is DPIA by default; clear both maps so the
    // `answers[ns] || {}` and `flatTasks[ns] || {}` fallbacks are exercised.
    taskStore.setActiveNamespace(FormType.DPIA)
    delete (answerStore.answers as Record<string, unknown>)[FormType.DPIA]
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.DPIA]

    const output = buildOutputData(taskStore, answerStore)

    expect(output.answers).toEqual({})
    expect(output.metadata).not.toHaveProperty('completedTasks')
  })

  it('groups repeatable answers under their parent task key', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.flatTasks[FormType.DPIA] = {
      '0': { id: '0', task: 'Intro', type: ['task_group'], parentId: null, childrenIds: ['0.1'] },
      '0.1': { id: '0.1', task: 'Name', type: ['text'], parentId: '0', childrenIds: [] },
      '2': { id: '2', task: 'Section', type: ['task_group'], parentId: null, childrenIds: ['2.1'] },
      '2.1': {
        id: '2.1', task: 'Repeatable', type: ['task_group'], repeatable: true,
        parentId: '2', childrenIds: ['2.1.1'],
      },
      '2.1.1': { id: '2.1.1', task: 'Field A', type: ['text'], parentId: '2.1', childrenIds: [] },
    } as Record<string, FlatTask>

    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'My project', lastEditedAt: '2026-01-01' },
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2026-01-01' },
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2026-01-01' },
    }

    const output = buildOutputData(taskStore, answerStore)

    expect(output.answers['0.1']).toEqual({ value: 'My project', lastEditedAt: '2026-01-01' })
    const arr = output.answers['2.1'] as Array<Record<string, unknown>>
    expect(Array.isArray(arr)).toBe(true)
    expect(arr).toHaveLength(2)
    expect(arr[0]['2.1.1']).toEqual({ value: 'Email', lastEditedAt: '2026-01-01' })
    expect(arr[1]['2.1.1']).toEqual({ value: 'Phone', lastEditedAt: '2026-01-01' })
    // Flat instance keys are not present at top level.
    expect(output.answers['2.1.1[0]']).toBeUndefined()
  })
})

describe('exportToJson', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()

    // jsdom does not implement object URLs — stub them.
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    // Anchor.click() would attempt a real navigation in jsdom.
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    clickSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('uses the explicit filename when provided (truthy branch)', () => {
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.answers[FormType.DPIA] = {
      '0.1': { value: 'test', lastEditedAt: '2026-01-01' },
    }

    let downloadedName = ''
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag) as HTMLElement
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          configurable: true,
          set(v: string) {
            downloadedName = v
          },
          get() {
            return downloadedName
          },
        })
      }
      return el
    })

    exportToJson(taskStore, answerStore, 'custom-name.json')

    expect(downloadedName).toBe('custom-name.json')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('generates a filename from the namespace when none is provided (falsy branch)', () => {
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.answers[FormType.PRE_SCAN] = {
      '0.1': { value: 'true', lastEditedAt: '2026-01-01' },
    }

    let downloadedName = ''
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag) as HTMLElement
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          configurable: true,
          set(v: string) {
            downloadedName = v
          },
          get() {
            return downloadedName
          },
        })
      }
      return el
    })

    exportToJson(taskStore, answerStore)

    // generateFilename: `${type}_<timestamp>.json`
    expect(downloadedName).toMatch(/^prescan_.*\.json$/)
  })
})

describe('downloadJsonFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    clickSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('serializes data, creates a Blob URL, clicks an anchor and revokes the URL', () => {
    const data = { hello: 'world', nested: { value: 1 } }

    let capturedHref = ''
    let capturedDownload = ''
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag) as HTMLElement
      if (tag === 'a') {
        Object.defineProperty(el, 'href', {
          configurable: true,
          set(v: string) {
            capturedHref = v
          },
          get() {
            return capturedHref
          },
        })
        Object.defineProperty(el, 'download', {
          configurable: true,
          set(v: string) {
            capturedDownload = v
          },
          get() {
            return capturedDownload
          },
        })
      }
      return el
    })

    downloadJsonFile(data, 'out.json')

    // Blob built with pretty-printed JSON (indent 4) and json mime type.
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toBe('application/json')

    expect(capturedHref).toBe('blob:mock-url')
    expect(capturedDownload).toBe('out.json')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

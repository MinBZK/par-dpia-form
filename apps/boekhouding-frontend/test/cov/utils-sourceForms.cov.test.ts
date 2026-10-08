/**
 * @vitest-environment jsdom
 *
 * Real pinia stores and the real assessment-core helpers; only the network
 * layer (src/api) is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore, useAnswerStore, useSchemaStore, FormType } from '@overheid-assessment/core'

const mockList = vi.fn()
const mockGet = vi.fn()

vi.mock('../../src/api', () => ({
  assessments: {
    list: (...args: unknown[]) => mockList(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

import { loadSourceForms, pickSourceAssessments, referencingForms } from '../../src/utils/sourceForms'
import type { AssessmentInstance } from '../../src/api'

function buildSchema(urn: string, references?: Record<string, unknown>) {
  return {
    name: 'Test',
    urn,
    version: '1.0',
    description: 'Test schema',
    tasks: [
      {
        id: '1',
        task: 'Beschrijving',
        type: ['task_group'],
        is_official_id: false,
        tasks: [{ id: '1.1', task: 'Beschrijf', type: ['open_text'], is_official_id: true }],
      },
      {
        id: '2',
        task: 'Risico\'s',
        type: ['task_group'],
        is_official_id: false,
        tasks: [
          {
            id: '2.1',
            task: 'Risico',
            type: ['task_group'],
            repeatable: true,
            is_official_id: true,
            tasks: [{
              id: '2.1.1',
              task: 'Omschrijving',
              type: ['open_text'],
              is_official_id: true,
              ...(references && { references }),
            }],
          },
        ],
      },
    ],
  }
}

const TO_AIIA = { AIIA: [{ id: '1.1', type: 'pre-view' }] }

const SCHEMAS = {
  preScan: buildSchema('urn:nl:prescan', { DPIA: [{ id: '1.1', type: 'pre-fill' }], ...TO_AIIA }),
  dpia: buildSchema('urn:nl:dpia', TO_AIIA),
  iama: buildSchema('urn:nl:iama', TO_AIIA),
  aiia: buildSchema('urn:nl:aiia'),
}

type AssessmentType = AssessmentInstance['assessmentType']

function instance(id: string, assessmentType: AssessmentType, state?: unknown): AssessmentInstance {
  return {
    id,
    projectId: 'p1',
    assessmentType,
    name: id,
    currentVersion: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    state,
  }
}

function stateWith(answers: Record<string, unknown>) {
  return { metadata: { createdAt: '2026-01-01T00:00:00Z' }, answers }
}

const answer = (value: string) => ({ value, lastEditedAt: '2026-01-01T00:00:00Z' })

// Serve `forms` from both list (in the given order) and get (by id).
function serve(forms: AssessmentInstance[]) {
  mockList.mockResolvedValue({ items: forms.map(({ state: _state, ...meta }) => meta), total: forms.length })
  mockGet.mockImplementation(async (id: string) => {
    const form = forms.find((f) => f.id === id)
    if (!form) throw new Error(`unknown ${id}`)
    return form
  })
}

function activate(namespace: FormType, schemas: Record<string, unknown> = SCHEMAS) {
  useSchemaStore().init(schemas as never)
  useTaskStore().setActiveNamespace(namespace)
  useAnswerStore().setActiveNamespace(namespace)
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  mockList.mockReset()
  mockGet.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('referencingForms', () => {
  it('lists every other form whose schema references the active one', () => {
    useSchemaStore().init(SCHEMAS as never)
    expect(referencingForms(FormType.AIIA)).toEqual([FormType.PRE_SCAN, FormType.DPIA, FormType.IAMA])
  })

  it('leaves the pre-scan out for a DPIA, which keeps its own snapshot', () => {
    useSchemaStore().init(SCHEMAS as never)
    expect(referencingForms(FormType.DPIA)).toEqual([])
  })

  it('returns nothing for the pre-scan, which is never a reference target', () => {
    useSchemaStore().init(SCHEMAS as never)
    expect(referencingForms(FormType.PRE_SCAN)).toEqual([])
  })

  it('skips forms whose schema is not loaded', () => {
    useSchemaStore().init({ iama: SCHEMAS.iama, aiia: SCHEMAS.aiia } as never)
    expect(referencingForms(FormType.AIIA)).toEqual([FormType.IAMA])
  })
})

describe('pickSourceAssessments', () => {
  it('takes the first assessment per wanted form and skips the active one', () => {
    const picked = pickSourceAssessments('self', [FormType.IAMA, FormType.DPIA], [
      instance('iama-new', 'iama'),
      instance('self', 'aiia'),
      instance('iama-old', 'iama'),
      instance('dpia', 'dpia'),
      instance('prescan', 'prescan'),
    ])
    expect(Object.fromEntries(picked)).toEqual({
      [FormType.IAMA]: 'iama-new',
      [FormType.DPIA]: 'dpia',
    })
  })
})

describe('loadSourceForms', () => {
  it('loads the other forms into their own namespace and restores the active one', async () => {
    activate(FormType.AIIA)
    const self = instance('self', 'aiia')
    serve([
      instance('iama', 'iama', stateWith({
        '1.1': answer('Uit het IAMA'),
        '2.1': [{ _index: 0, '2.1.1': answer('Eerste') }, { _index: 2, '2.1.1': answer('Derde') }],
      })),
      instance('dpia', 'dpia', stateWith({ '1.1': answer('Uit de DPIA') })),
      self,
    ])

    await loadSourceForms(self)

    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    expect(mockList).toHaveBeenCalledWith('p1', 1, 500)
    expect(mockGet).not.toHaveBeenCalledWith('self')
    expect(answerStore.getAnswerFromNamespace(FormType.IAMA, '1.1')).toBe('Uit het IAMA')
    expect(answerStore.getAnswerFromNamespace(FormType.DPIA, '1.1')).toBe('Uit de DPIA')
    expect(answerStore.getAnswerFromNamespace(FormType.IAMA, '2.1.1[2]')).toBe('Derde')
    expect(taskStore.getInstanceIdsForTaskFromNamespace(FormType.IAMA, '2.1')).toContain('2.1[2]')
    expect(taskStore.activeNamespace).toBe(FormType.AIIA)
    expect(answerStore.activeNamespace).toBe(FormType.AIIA)
  })

  it('unwraps answers stored in the old namespace-keyed format', async () => {
    activate(FormType.AIIA)
    serve([
      instance('dpia', 'dpia', stateWith({ [FormType.DPIA]: { '1.1': answer('Oud formaat') } })),
      instance('iama', 'iama', stateWith({ [FormType.DPIA]: { '1.1': answer('Hoort niet bij IAMA') } })),
    ])

    await loadSourceForms(instance('self', 'aiia'))

    const answerStore = useAnswerStore()
    expect(answerStore.getAnswerFromNamespace(FormType.DPIA, '1.1')).toBe('Oud formaat')
    expect(answerStore.getAnswerFromNamespace(FormType.IAMA, '1.1')).toBeNull()
  })

  it('initializes a source form without answers', async () => {
    activate(FormType.AIIA)
    serve([instance('iama', 'iama', { metadata: { createdAt: '2026-01-01T00:00:00Z' } })])

    await loadSourceForms(instance('self', 'aiia'))

    expect(useTaskStore().isInitialized[FormType.IAMA]).toBe(true)
  })

  it('skips a source without a stored state', async () => {
    activate(FormType.AIIA)
    serve([instance('iama', 'iama'), instance('dpia', 'dpia', { answers: {} })])

    await loadSourceForms(instance('self', 'aiia'))

    const taskStore = useTaskStore()
    expect(taskStore.isInitialized[FormType.IAMA]).toBe(false)
    expect(taskStore.isInitialized[FormType.DPIA]).toBe(false)
  })

  it('makes no requests when no other form references the active one', async () => {
    activate(FormType.IAMA)

    await loadSourceForms(instance('self', 'iama'))

    expect(mockList).not.toHaveBeenCalled()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('leaves a namespace that is already initialized untouched', async () => {
    activate(FormType.AIIA)
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.IAMA)
    taskStore.init(SCHEMAS.iama.tasks as never)
    taskStore.setActiveNamespace(FormType.AIIA)
    answerStore.answers[FormType.IAMA] = { '1.1': answer('Al geladen') }
    serve([instance('iama', 'iama', stateWith({ '1.1': answer('Van de server') }))])

    await loadSourceForms(instance('self', 'aiia'))

    expect(answerStore.getAnswerFromNamespace(FormType.IAMA, '1.1')).toBe('Al geladen')
  })

  it('opens the form without sources when the project list fails', async () => {
    activate(FormType.AIIA)
    mockList.mockRejectedValue(new Error('netwerk'))

    await loadSourceForms(instance('self', 'aiia'))

    expect(mockGet).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('Kon de andere assessments in het project niet ophalen:', expect.any(Error))
  })

  it('still loads the other sources when one of them fails', async () => {
    activate(FormType.AIIA)
    serve([instance('dpia', 'dpia', stateWith({ '1.1': answer('Uit de DPIA') }))])
    mockList.mockResolvedValue({
      items: [instance('weg', 'iama'), instance('dpia', 'dpia')],
      total: 2,
    })

    await loadSourceForms(instance('self', 'aiia'))

    expect(warn).toHaveBeenCalledWith('Kon assessment weg (iama) niet laden:', expect.any(Error))
    expect(useAnswerStore().getAnswerFromNamespace(FormType.DPIA, '1.1')).toBe('Uit de DPIA')
  })
})

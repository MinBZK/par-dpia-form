/**
 * @vitest-environment jsdom
 *
 * The answer and task stores are shared by every editor in a tab. An editor that
 * is still around after another assessment was opened must not save the stores,
 * because they now hold the other assessment's answers. The real Form and
 * ApiPersistence run against an in-memory server with the backend's version check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, provide } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  useTaskStore, useAnswerStore, useSchemaStore, FormType, Form, PERSISTENCE_KEY,
  OUTPUT_SCHEMA_URL, flattenGroupedAnswers,
} from '@overheid-assessment/core'
import preScan from '../../../sources/generated/PreScanDPIA.json'
import dpia from '../../../sources/generated/DPIA.json'
import iama from '../../../sources/generated/IAMA.json'

const { db, puts, ApiError } = vi.hoisted(() => ({
  db: {} as Record<string, { version: number; state: any }>,
  puts: [] as string[],
  ApiError: class ApiError extends Error { constructor(public status: number) { super(String(status)) } },
}))

vi.mock('../src/api', () => ({
  assessments: {
    get: async (id: string) => ({
      currentVersion: db[id].version,
      updatedAt: '2026-11-25T09:00:00.000Z',
      state: JSON.parse(JSON.stringify(db[id].state)),
    }),
    update: async (id: string, state: any, opts: { expectedVersion: number }) => {
      if (opts.expectedVersion !== db[id].version) throw new ApiError(409)
      db[id].version++
      db[id].state = JSON.parse(JSON.stringify(state))
      puts.push(id)
      return { currentVersion: db[id].version }
    },
  },
  ApiError,
  SessionExpiredError: class extends Error {},
}))

import { createApiPersistence } from '../src/ApiPersistence'

function iamaState(answers: Record<string, string>) {
  return {
    $schema: OUTPUT_SCHEMA_URL,
    metadata: { createdAt: '2026-11-25T09:00:00.000Z', urn: 'urn:nl:iama:1.0' },
    answers: Object.fromEntries(Object.entries(answers).map(([k, value]) =>
      [k, { value, lastEditedAt: '2026-11-25T09:00:00.000Z' }])),
  }
}

// What AssessmentEditor does around <Form>: reset the stores, provide the persistence.
function openEditor(assessmentId: string) {
  const Editor = defineComponent({
    setup() {
      useTaskStore().reset()
      useAnswerStore().reset()
      useTaskStore().setActiveNamespace(FormType.IAMA)
      useAnswerStore().setActiveNamespace(FormType.IAMA)
      const { conflictState: _conflict, sync: _sync, ...persistence } = createApiPersistence(assessmentId)
      provide(PERSISTENCE_KEY, persistence)
      return () => h(Form, {
        navigation: { goToLanding() {}, goToPreScanDPIA() {}, goToDPIA() {} },
        namespace: FormType.IAMA,
        validData: useSchemaStore().getSchema(FormType.IAMA),
        showBanner: false,
        showNavHeader: false,
        showFileActions: false,
        autoStart: true,
      })
    },
  })
  return mount(Editor)
}

// Past the 500 ms save debounce
const settle = async () => {
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 700))
}

const answersOn = (id: string) =>
  Object.fromEntries(Object.entries(flattenGroupedAnswers(db[id].state.answers)).map(([k, a]) => [k, a.value]))

describe('an editor whose assessment is no longer in the stores', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSchemaStore().init({ preScan: preScan as any, dpia: dpia as any, iama: iama as any })
    puts.length = 0
    db.first = { version: 5, state: iamaState({ '1.1.1': 'eerste 1', '1.1.2': 'eerste 2', '1.2.1': 'eerste 3' }) }
    db.second = { version: 3, state: iamaState({ '1.1.1': 'tweede 1' }) }
  })

  it('does not save the next assessment’s answers into its own', async () => {
    const first = openEditor('first')
    await settle()
    first.unmount()

    openEditor('second')
    await settle()
    useAnswerStore().setAnswer('1.1.2', 'dit en dat')
    await settle()

    expect(puts).toEqual(['second'])
    expect(answersOn('first')).toEqual({ '1.1.1': 'eerste 1', '1.1.2': 'eerste 2', '1.2.1': 'eerste 3' })
    expect(answersOn('second')).toEqual({ '1.1.1': 'tweede 1', '1.1.2': 'dit en dat' })
  })
})

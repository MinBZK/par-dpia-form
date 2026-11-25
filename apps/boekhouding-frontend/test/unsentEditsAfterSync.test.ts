/**
 * @vitest-environment jsdom
 *
 * An edit this tab has not sent yet must still go out after a colleague's change
 * is merged in, whichever way that merge happens. The real ApiPersistence runs
 * against an in-memory server with the backend's optimistic-lock semantics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  useTaskStore, useAnswerStore, useSchemaStore, FormType, OUTPUT_SCHEMA_URL,
  rebuildRepeatableInstances, flattenGroupedAnswers,
} from '@overheid-assessment/core'
import preScan from '../../../sources/generated/PreScanDPIA.json'
import dpia from '../../../sources/generated/DPIA.json'
import iama from '../../../sources/generated/IAMA.json'

const { server, ApiError } = vi.hoisted(() => ({
  server: { version: 1, state: null as any, updatedAt: '2026-11-25T09:00:00.000Z', puts: 0 },
  ApiError: class ApiError extends Error { constructor(public status: number) { super(String(status)) } },
}))

vi.mock('../src/api', () => ({
  assessments: {
    get: async () => ({
      currentVersion: server.version,
      updatedAt: server.updatedAt,
      state: JSON.parse(JSON.stringify(server.state)),
    }),
    update: async (_id: string, state: any, opts: { expectedVersion: number }) => {
      if (opts.expectedVersion !== server.version) throw new ApiError(409)
      server.version++
      server.puts++
      server.state = JSON.parse(JSON.stringify(state))
      server.updatedAt = new Date().toISOString()
      return { currentVersion: server.version }
    },
  },
  ApiError,
  SessionExpiredError: class extends Error {},
}))

import { createApiPersistence } from '../src/ApiPersistence'

const answer = (value: string) => ({ value, lastEditedAt: '2026-11-25T09:00:00.000Z' })

// A colleague's save, straight onto the server
function colleagueSaves(answers: Record<string, string>) {
  for (const [key, value] of Object.entries(answers)) server.state.answers[key] = answer(value)
  server.version++
  server.updatedAt = new Date().toISOString()
}

const serverAnswers = () => Object.fromEntries(
  Object.entries(flattenGroupedAnswers(server.state.answers)).map(([k, a]) => [k, a.value]))

const pastDebounce = () => new Promise(resolve => setTimeout(resolve, 650))

async function openEditor() {
  setActivePinia(createPinia())
  const schemaStore = useSchemaStore()
  schemaStore.init({ preScan: preScan as any, dpia: dpia as any, iama: iama as any })
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()
  taskStore.setActiveNamespace(FormType.IAMA)
  answerStore.setActiveNamespace(FormType.IAMA)

  const p = createApiPersistence('a1')
  const saved = await p.loadAppState(FormType.IAMA)
  taskStore.init(schemaStore.getSchema(FormType.IAMA)!.tasks)
  if (saved) {
    p.applyAppState(saved)
    rebuildRepeatableInstances(taskStore, answerStore, saved.answers)
  }
  p.snapshotBaseline!()
  p.setupWatchers()

  const sectionOf = (fieldId: string) => {
    let id = fieldId
    while (taskStore.flatTasks[FormType.IAMA][id]?.parentId) id = taskStore.flatTasks[FormType.IAMA][id].parentId!
    return id
  }
  const type = async (key: string, value: string) => {
    answerStore.setAnswer(key, value)
    await nextTick()
  }
  return { p, sectionOf, type }
}

describe('an unsent edit after a colleague’s change is merged', () => {
  beforeEach(() => {
    server.version = 1
    server.puts = 0
    server.state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { createdAt: '2026-11-25T09:00:00.000Z', urn: 'urn:nl:iama:1.0' },
      answers: {},
    }
  })

  it('still goes out when the poll lands inside the save debounce', async () => {
    const { p, sectionOf, type } = await openEditor()
    await type('1.1.1', 'mijn tekst')
    colleagueSaves({ '2.1.1': 'collega in een andere sectie' })

    await p.sync.handleRemoteChange(sectionOf('1.1.1'))
    await pastDebounce()

    expect(serverAnswers()).toEqual({ '1.1.1': 'mijn tekst', '2.1.1': 'collega in een andere sectie' })
  })

  it('goes out after the deferred change is taken over with [Bijwerken]', async () => {
    const { p, sectionOf, type } = await openEditor()
    colleagueSaves({ '1.1.1': 'collega' })
    await p.sync.handleRemoteChange(sectionOf('1.1.1'))

    await type('1.1.2', 'mijn tekst')
    await pastDebounce()
    await pastDebounce()

    expect(serverAnswers()).toEqual({ '1.1.1': 'collega', '1.1.2': 'mijn tekst' })
  })

  it('goes out after a conflict is resolved as "mine"', async () => {
    const { p, sectionOf, type } = await openEditor()
    colleagueSaves({ '1.1.1': 'collega' })
    await p.sync.handleRemoteChange(sectionOf('1.1.1'))

    await type('1.1.1', 'mijn tekst')
    await pastDebounce()
    expect(p.conflictState.active).toBe(true)

    p.conflictState.resolve(new Map([['1.1.1', 'mine']]))
    await pastDebounce()

    expect(serverAnswers()).toEqual({ '1.1.1': 'mijn tekst' })
  })

  it('stays pending when the deferred change is applied by navigating away', async () => {
    const { p, sectionOf, type } = await openEditor()
    await type('1.1.2', 'mijn tekst')
    colleagueSaves({ '1.1.1': 'collega' })
    await p.sync.handleRemoteChange(sectionOf('1.1.1'))
    p.flushSave!()

    p.sync.applyDeferredOnNavigate()
    await p.saveAppState()

    expect(serverAnswers()).toEqual({ '1.1.1': 'collega', '1.1.2': 'mijn tekst' })
  })
})

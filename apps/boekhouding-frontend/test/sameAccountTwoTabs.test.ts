/**
 * @vitest-environment jsdom
 *
 * One account with the same assessment open in two tabs (or on two devices).
 * The sync poll reports a newer version as "modified by self"; the tab that did
 * not make it must still take the content over before its next save, or that
 * save overwrites the other tab's work while passing the version check.
 */
import { describe, it, expect, vi } from 'vitest'
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
  server: { version: 1, state: null as any, updatedAt: '2026-11-25T09:00:00.000Z' },
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
      server.state = JSON.parse(JSON.stringify(state))
      server.updatedAt = new Date().toISOString()
      return { currentVersion: server.version }
    },
  },
  ApiError,
  SessionExpiredError: class extends Error {},
}))

import { createApiPersistence } from '../src/ApiPersistence'

// Each tab gets its own pinia; the steps mirror Form.vue's onMounted.
async function openTab() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const schemaStore = useSchemaStore()
  schemaStore.init({ preScan: preScan as any, dpia: dpia as any, iama: iama as any })
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()
  taskStore.setActiveNamespace(FormType.IAMA)
  answerStore.setActiveNamespace(FormType.IAMA)

  const persistence = createApiPersistence('a1')
  const saved = await persistence.loadAppState(FormType.IAMA)
  taskStore.init(schemaStore.getSchema(FormType.IAMA)!.tasks)
  if (saved) {
    persistence.applyAppState(saved)
    rebuildRepeatableInstances(taskStore, answerStore, saved.answers)
  }
  persistence.snapshotBaseline!()
  persistence.setupWatchers()

  return {
    persistence,
    async edit(key: string, value: string) {
      setActivePinia(pinia)
      answerStore.setAnswer(key, value)
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 650))
    },
    // AssessmentEditor's poll watcher for a version this tab does not hold yet
    async poll() {
      setActivePinia(pinia)
      await persistence.sync.handleRemoteChange(taskStore.currentRootTaskId[FormType.IAMA])
    },
  }
}

describe('same account, two tabs', () => {
  it('keeps the other tab’s work when the stale tab saves after a poll', async () => {
    server.state = {
      $schema: OUTPUT_SCHEMA_URL,
      metadata: { createdAt: '2026-11-25T09:00:00.000Z', urn: 'urn:nl:iama:1.0' },
      answers: {},
    }
    const stale = await openTab()
    const busy = await openTab()

    for (const key of ['1.1.1', '1.1.2', '1.2.1', '1.2.2']) await busy.edit(key, `werk in ${key}`)

    await stale.poll()
    await stale.edit('1.4.2', 'klein dingetje')

    expect(Object.keys(flattenGroupedAnswers(server.state.answers)).sort())
      .toEqual(['1.1.1', '1.1.2', '1.2.1', '1.2.2', '1.4.2'])
  })
})

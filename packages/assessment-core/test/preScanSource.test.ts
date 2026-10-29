import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { useReferences } from '../src/composables/useReferences'
import { applyPreScanSource } from '../src/utils/applyState'
import { FormType } from '../src/models/dpia'

import dpiaSchema from '../../../sources/generated/DPIA.json' with { type: 'json' }
import prescanSchema from '../../../sources/generated/PreScanDPIA.json' with { type: 'json' }
import iamaSchema from '../../../sources/generated/IAMA.json' with { type: 'json' }

// A pre-scan file uploaded at the start of a standalone DPIA, against the real
// sources: it must feed the DPIA's references and stay out of its answers.
describe('applyPreScanSource', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    const schemaStore = useSchemaStore()
    schemaStore.init({ preScan: prescanSchema, dpia: dpiaSchema, iama: iamaSchema })
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(schemaStore.getSchema(FormType.DPIA)!.tasks)
  })

  it('prefills the DPIA from the pre-scan and leaves the DPIA answers empty', () => {
    applyPreScanSource(
      {
        metadata: { createdAt: '2026-10-27T00:00:00Z', urn: 'urn:nl:prescan:1.0' },
        // 0.2 maps one-to-one onto DPIA 1.1. 8.1.1 is a colofon answer, an id
        // the DPIA also has: it must stay in the pre-scan.
        answers: { '0.2': { value: 'Verwerking van aanvragen' }, '8.1.1': { value: 'v1.0' } },
      },
      useSchemaStore().getSchema(FormType.PRE_SCAN)!.tasks,
      taskStore,
      answerStore,
    )

    expect(taskStore.activeNamespace).toBe(FormType.DPIA)
    expect(answerStore.activeNamespace).toBe(FormType.DPIA)
    expect(answerStore.answers[FormType.DPIA]).toEqual({})
    expect(answerStore.answers[FormType.PRE_SCAN]['0.2']).toMatchObject({ value: 'Verwerking van aanvragen' })
    expect(useReferences().getPrefillValueForTask(taskStore.taskById('1.1')!)).toBe('Verwerking van aanvragen')
  })
})

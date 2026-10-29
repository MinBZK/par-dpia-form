import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { useReferences } from '../src/composables/useReferences'
import { applySourceForm } from '../src/utils/applyState'
import { FormType } from '../src/models/dpia'

import dpiaSchema from '../../../sources/generated/DPIA.json' with { type: 'json' }
import prescanSchema from '../../../sources/generated/PreScanDPIA.json' with { type: 'json' }
import iamaSchema from '../../../sources/generated/IAMA.json' with { type: 'json' }

// A DPIA and an IAMA linked in a project, against the real sources: each shows
// the other's answers where the handreiking links their questions.
describe('applySourceForm with the DPIA-IAMA links', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let schemaStore: ReturnType<typeof useSchemaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    schemaStore = useSchemaStore()
    schemaStore.init({ preScan: prescanSchema, dpia: dpiaSchema, iama: iamaSchema })
  })

  const open = (namespace: FormType) => {
    taskStore.setActiveNamespace(namespace)
    answerStore.setActiveNamespace(namespace)
    taskStore.init(schemaStore.getSchema(namespace)!.tasks)
  }

  it('shows the purposes of the DPIA in part 1 of the IAMA', () => {
    open(FormType.IAMA)
    applySourceForm(
      { metadata: { createdAt: '2026-10-27T00:00:00Z' }, answers: { '5.1': [{ _index: 0, '5.1.1': { value: 'Aanvragen beoordelen' } }] } },
      FormType.DPIA,
      schemaStore.getSchema(FormType.DPIA)!.tasks,
      taskStore,
      answerStore,
    )

    expect(taskStore.activeNamespace).toBe(FormType.IAMA)
    expect(answerStore.activeNamespace).toBe(FormType.IAMA)
    expect(answerStore.answers[FormType.IAMA]).toEqual({})
    const preview = useReferences().getPreviewDataForSection('1')
    expect(preview).toContainEqual(expect.objectContaining({
      sourceNamespace: FormType.DPIA, taskId: '5.1.1', answer: 'Aanvragen beoordelen',
    }))
  })

  it('shows the purpose from the IAMA in section 5 of the DPIA', () => {
    open(FormType.DPIA)
    applySourceForm(
      { metadata: { createdAt: '2026-10-27T00:00:00Z' }, answers: { '1.1.2': { value: 'Sneller beslissen' } } },
      FormType.IAMA,
      schemaStore.getSchema(FormType.IAMA)!.tasks,
      taskStore,
      answerStore,
    )

    expect(useReferences().getPreviewDataForSection('5')).toEqual([
      expect.objectContaining({ sourceNamespace: FormType.IAMA, taskId: '1.1.2', answer: 'Sneller beslissen' }),
    ])
  })
})

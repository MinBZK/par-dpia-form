import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { useCalculationStore } from '../src/stores/calculations'
import { FormType, type Task } from '../src/models/dpia'

import dpiaSchema from '../../../sources/generated/DPIA.json' with { type: 'json' }
import prescanSchema from '../../../sources/generated/PreScanDPIA.json' with { type: 'json' }

// The DPIA verdict of the real pre-scan, as the "Tussenresultaten" block shows it.
describe('pre-scan DPIA verdict with the AP and EDPB lists', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>
  let calculationStore: ReturnType<typeof useCalculationStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    calculationStore = useCalculationStore()
    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    useSchemaStore().init({ dpia: dpiaSchema, preScan: prescanSchema })
    taskStore.init((prescanSchema as { tasks: Task[] }).tasks, true)
  })

  const pick = (taskId: string, count: number) => {
    const values = (taskStore.taskById(taskId)?.options ?? []).map(option => String(option.value))
    answerStore.setAnswer(taskStore.getInstanceIdsForTask(taskId)[0], values.slice(0, count))
  }

  const dpiaVerdict = async () => {
    calculationStore.init()
    await calculationStore.runCalculations()
    return calculationStore.assessmentResults.find(result => result.id === 'DPIA')
  }

  it('names the single EDPB item next to the AP list when the DPIA is required', async () => {
    pick('3.1', 2)
    pick('4.1', 1)

    const dpia = await dpiaVerdict()

    expect(dpia?.result).toBe('DPIA verplicht')
    expect(dpia?.criteria?.map(criterion => criterion.id)).toEqual(['aplist', 'edpblist1'])
  })

  it('still only recommends a DPIA for a single EDPB item on its own', async () => {
    pick('4.1', 1)

    const dpia = await dpiaVerdict()

    expect(dpia?.result).toBe('DPIA aanbevolen')
    expect(dpia?.criteria?.map(criterion => criterion.id)).toEqual(['edpblist1'])
  })

  it('does not name the single-item criterion once two EDPB items make the DPIA required', async () => {
    pick('4.1', 2)

    const dpia = await dpiaVerdict()

    expect(dpia?.result).toBe('DPIA verplicht')
    expect(dpia?.criteria?.map(criterion => criterion.id)).toEqual(['edpblist2'])
  })
})

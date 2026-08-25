import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { useCalculationStore } from '../src/stores/calculations'
import { shouldShowTask } from '../src/utils/dependency'
import { FormType, type Task } from '../src/models/dpia'

import dpiaSchema from '../../../sources/generated/DPIA.json' with { type: 'json' }
import prescanSchema from '../../../sources/generated/PreScanDPIA.json' with { type: 'json' }
import iamaSchema from '../../../sources/generated/IAMA.json' with { type: 'json' }

const ASSESSMENTS: [string, Task[]][] = [
  ['DPIA', (dpiaSchema as { tasks: Task[] }).tasks],
  ['PreScanDPIA', (prescanSchema as { tasks: Task[] }).tasks],
  ['IAMA', (iamaSchema as { tasks: Task[] }).tasks],
]

function flatten(tasks: Task[], out: Task[] = []): Task[] {
  for (const task of tasks) {
    out.push(task)
    if (task.tasks) flatten(task.tasks, out)
  }
  return out
}

function optionValuesOf(task: Task | undefined): string[] {
  return (task?.options ?? []).map(option => String(option.value))
}

/**
 * An answer stores the option's `value`, so every consumer that compares
 * answers (dependencies, calculations, exports) only works while `value` stays
 * a plain, stable identifier. Display markup belongs in `label`.
 */
describe.each(ASSESSMENTS)('%s option values stay plain identifiers', (_name, tasks) => {
  const all = flatten(tasks)

  it('carries no HTML in any option value', () => {
    const withHtml = all
      .filter(task => (task.options ?? []).some(o => typeof o.value === 'string' && /<[a-z]/i.test(o.value)))
      .map(task => task.id)

    expect(withHtml).toEqual([])
  })

  it('matches every dependency condition value to a real option value', () => {
    const unmatched: string[] = []

    for (const task of all) {
      for (const dependency of task.dependencies ?? []) {
        if (dependency.type !== 'conditional' || !dependency.condition) continue
        const { id, operator, value } = dependency.condition
        if (operator !== 'equals' && operator !== 'contains') continue
        if (typeof value !== 'string') continue

        const options = optionValuesOf(all.find(t => t.id === id))
        if (options.length === 0) continue

        // A `contains` condition is written quoted in the YAML sources.
        const needle = value.replace(/^'|'$/g, '')
        if (!options.includes(needle)) unmatched.push(`${task.id} -> ${id}`)
      }
    }

    expect(unmatched).toEqual([])
  })

  it('matches every weightedCountMap key to a real option value', () => {
    const unmatched: string[] = []

    for (const task of all) {
      const expression = task.calculation?.expression
      if (!expression?.includes('weightedCountMap')) continue

      const sourceId = /answers\(\s*'([^']+)'\s*\)/.exec(expression)?.[1]
      const keys = [...expression.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(k => k !== sourceId)
      const options = optionValuesOf(all.find(t => t.id === sourceId))

      for (const key of keys) {
        if (!options.includes(key)) unmatched.push(`${task.id}: ${key}`)
      }
    }

    expect(unmatched).toEqual([])
  })
})

describe('DPIA 13.1.1.6 follow-up question', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    useSchemaStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init((dpiaSchema as { tasks: Task[] }).tasks, true)
  })

  it('appears once the toelaatbaar option is selected', () => {
    const source = taskStore.getInstanceIdsForTask('13.1.1.5')[0]
    const target = taskStore.getInstanceIdsForTask('13.1.1.6')[0]
    const option = optionValuesOf(taskStore.taskById('13.1.1.5'))[0]

    expect(shouldShowTask('13.1.1.6', target, taskStore, answerStore)).toBe(false)

    answerStore.setAnswer(source, option)

    expect(shouldShowTask('13.1.1.6', target, taskStore, answerStore)).toBe(true)
  })
})

describe('pre-scan weighted scores', () => {
  it('counts a weighted option towards its risk score', async () => {
    setActivePinia(createPinia())
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    const schemaStore = useSchemaStore()
    const calculationStore = useCalculationStore()

    taskStore.setActiveNamespace(FormType.PRE_SCAN)
    answerStore.setActiveNamespace(FormType.PRE_SCAN)
    schemaStore.init({ dpia: dpiaSchema, preScan: prescanSchema })
    taskStore.init((prescanSchema as { tasks: Task[] }).tasks, true)

    const instanceId = taskStore.getInstanceIdsForTask('5.1.2')[0]
    // 'Basisregistratie Inkomen (BRI)' carries weight 1 in the expression.
    answerStore.setAnswer(instanceId, [optionValuesOf(taskStore.taskById('5.1.2'))[1]])

    calculationStore.init()
    await calculationStore.runCalculations()

    expect(calculationStore.calculatedScores['basisregistratie']).toBe(1)
  })
})

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useCalculationStore } from '../../src/stores/calculations'
import { useAnswerStore } from '../../src/stores/answers'
import { useTaskStore } from '../../src/stores/tasks'
import { useSchemaStore } from '../../src/stores/schemas'
import { FormType, type Task } from '../../src/models/dpia'

// Minimum fields the io-ts DPIA codec requires; only those used by calculations.ts matter.
function buildSchema(opts: {
  urn?: string
  tasks?: any[]
  assessments?: any[] | undefined
}) {
  const schema: any = {
    name: 'Test schema',
    urn: opts.urn ?? 'urn:nl:test',
    version: '1.0',
    description: 'Test',
    tasks: opts.tasks ?? [],
  }
  if (opts.assessments !== undefined) {
    schema.assessments = opts.assessments
  }
  return schema
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let consoleLogSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()
  consoleLogSpy.mockRestore()
})

function setupStores(namespace: FormType, schemaJson: any, taskTree: Task[]) {
  const schemaStore = useSchemaStore()
  const taskStore = useTaskStore()
  const answerStore = useAnswerStore()

  taskStore.setActiveNamespace(namespace)
  answerStore.setActiveNamespace(namespace)

  // schemaStore.init requires both namespace slots; the inactive one gets a trivially valid schema.
  const other = buildSchema({ tasks: [] })
  schemaStore.init({
    dpia: namespace === FormType.DPIA ? schemaJson : other,
    preScan: namespace === FormType.PRE_SCAN ? schemaJson : other,
  })

  taskStore.init(taskTree, true)

  return { schemaStore, taskStore, answerStore }
}

describe('useCalculationStore - setupJexl transforms & functions', () => {
  it('count transform: counts array length and returns 0 for null/non-array', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Count selected',
        type: ['select_option'],
        calculation: {
          expression: 'answers("1")|count',
          scoreKey: 'countVal',
          riskScore: [
            { when: 'countVal == 3', value: 3 },
            { when: 'countVal == 0', value: 0 },
          ],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.DPIA, schema, tasks as Task[])

    answerStore.answers[FormType.DPIA]['1'] = {
      value: ['a', 'b', 'c'],
      lastEditedAt: '2024-01-01',
    }

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.countVal).toBe(3)

    answerStore.answers[FormType.DPIA]['1'] = { value: 'not-an-array', lastEditedAt: '2024-01-01' }
    await store.runCalculations()
    expect(store.calculatedScores.countVal).toBe(0)
  })

  it('weightedCountMap: returns 0 for null/non-array, weighted sum otherwise', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Weighted',
        type: ['select_option'],
        calculation: {
          expression: 'weightedCountMap(answers("1"), ["x","y","z"], [2,3])',
          scoreKey: 'weighted',
          riskScore: [
            { when: 'weighted == 5', value: 5 },
            { when: 'weighted == 0', value: 0 },
          ],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.DPIA, schema, tasks as Task[])

    answerStore.answers[FormType.DPIA]['1'] = {
      value: ['x', 'y', 'z', 'unknown'],
      lastEditedAt: '2024-01-01',
    }

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.weighted).toBe(5)

    answerStore.answers[FormType.DPIA]['1'] = { value: 'string', lastEditedAt: '2024-01-01' }
    await store.runCalculations()
    expect(store.calculatedScores.weighted).toBe(0)
  })

  it('answers function: returns null when no instances exist for a task id', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Uses missing id',
        type: ['text_input'],
        calculation: {
          expression: 'answers("missing")|count',
          scoreKey: 'missingCount',
          riskScore: [{ when: 'missingCount == 0', value: 0 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.missingCount).toBe(0)
  })

  it('bool function: true for true/"true", false for null/undefined/other', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Bool of true-string',
        type: ['text_input'],
        calculation: {
          expression: 'bool(answers("1"))',
          scoreKey: 'boolTrue',
          riskScore: [{ when: 'boolTrue == true', value: 1 }],
        },
      },
      {
        id: '2',
        task: 'Bool of empty',
        type: ['text_input'],
        calculation: {
          expression: 'bool(answers("2"))',
          scoreKey: 'boolNull',
          riskScore: [{ when: 'boolNull == false', value: 9 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.DPIA, schema, tasks as Task[])

    answerStore.answers[FormType.DPIA]['1'] = { value: 'true', lastEditedAt: '2024-01-01' }

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.boolTrue).toBe(1)
    expect(store.calculatedScores.boolNull).toBe(9)

    answerStore.answers[FormType.DPIA]['1'] = { value: 'nope', lastEditedAt: '2024-01-01' }
    await store.runCalculations()
    expect(store.calculatedScores.boolTrue).toBeUndefined()
  })

  it('countSelectedOptions: 0 for no instance, 0 for non-array answer, length otherwise', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Count options',
        type: ['select_option'],
        calculation: {
          expression: 'countSelectedOptions("1")',
          scoreKey: 'sel',
          riskScore: [{ when: 'sel == 2', value: 2 }],
        },
      },
      {
        id: '2',
        task: 'No instance',
        type: ['select_option'],
        calculation: {
          expression: 'countSelectedOptions("ghost")',
          scoreKey: 'ghost',
          riskScore: [{ when: 'ghost == 0', value: 0 }],
        },
      },
      {
        id: '3',
        task: 'Non-array answer',
        type: ['text_input'],
        calculation: {
          expression: 'countSelectedOptions("3")',
          scoreKey: 'nonArr',
          riskScore: [{ when: 'nonArr == 0', value: 0 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.DPIA, schema, tasks as Task[])

    answerStore.answers[FormType.DPIA]['1'] = { value: ['a', 'b'], lastEditedAt: '2024-01-01' }
    answerStore.answers[FormType.DPIA]['3'] = { value: 'plain', lastEditedAt: '2024-01-01' }

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.sel).toBe(2)
    expect(store.calculatedScores.ghost).toBe(0)
    expect(store.calculatedScores.nonArr).toBe(0)
  })

  it('countSelectedOptions: 0 when instance exists but answer is null (no value stored)', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'No answer stored',
        type: ['select_option'],
        calculation: {
          expression: 'countSelectedOptions("1")',
          scoreKey: 'noAns',
          riskScore: [{ when: 'noAns == 0', value: 0 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.noAns).toBe(0)
  })

  it('criteriaCheck: true when any value is true, used inside assessment criteria', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'DPIA',
        levels: [
          {
            level: 'required',
            result: 'verplicht',
            explanation: 'standaard',
            expression: 'criteriaCheck(criteria)',
            criteria: [
              { id: 'c1', expression: 'true', explanation: 'altijd waar' },
              { id: 'c2', expression: 'false', explanation: 'nooit' },
            ],
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults).toHaveLength(1)
    expect(store.assessmentResults[0].id).toBe('DPIA')
    expect(store.assessmentResults[0].required).toBe(true)
  })
})

describe('useCalculationStore - calculateTaskScore', () => {
  it('returns null (no score stored) when a task has no calculation', async () => {
    const tasks: any[] = [{ id: '1', task: 'Plain', type: ['text_input'] }]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores).toEqual({})
    expect(store.calculationErrors).toEqual([])
  })

  it('riskScore: stores value when scoreKey present and condition met', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk',
        type: ['text_input'],
        calculation: {
          expression: '5',
          scoreKey: 'risk',
          riskScore: [
            { when: 'risk < 3', value: 0 },
            { when: 'risk >= 3', value: 2 },
          ],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.risk).toBe(2)
  })

  it('riskScore: condition met but no scoreKey -> returns value without storing', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk no scoreKey',
        type: ['text_input'],
        calculation: {
          expression: '7',
          riskScore: [{ when: 'true', value: 4 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores).toEqual({})
    expect(store.calculationErrors).toEqual([])
  })

  it('riskScore: no condition met -> returns the raw evaluated value', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'No match',
        type: ['text_input'],
        calculation: {
          expression: '10',
          scoreKey: 'noMatch',
          riskScore: [{ when: 'noMatch < 0', value: 1 }],
        },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores).toEqual({})
  })

  it('no riskScore array -> returns raw value (skips the loop)', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Just expression',
        type: ['text_input'],
        calculation: { expression: '42' },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores).toEqual({})
    expect(store.calculationErrors).toEqual([])
  })

  it('catches evaluation errors and returns null', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Broken',
        type: ['text_input'],
        calculation: { expression: 'this is ((( not valid', scoreKey: 'broken' },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores).toEqual({})
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})

describe('useCalculationStore - processTaskScores recursion', () => {
  it('recurses into nested tasks and handles tasks that are not arrays', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Parent',
        type: ['task_group'],
        calculation: { expression: '1', scoreKey: 'parentScore', riskScore: [{ when: 'true', value: 1 }] },
        tasks: [
          {
            id: '1.1',
            task: 'Child',
            type: ['text_input'],
            calculation: { expression: '2', scoreKey: 'childScore', riskScore: [{ when: 'true', value: 2 }] },
          },
        ],
      },
      {
        id: '2',
        task: 'No calc, has empty children array',
        type: ['task_group'],
        tasks: [],
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculatedScores.parentScore).toBe(1)
    expect(store.calculatedScores.childScore).toBe(2)
  })
})

describe('useCalculationStore - evaluateAssessments & evaluateCriteria', () => {
  it('warns and returns when schema has no assessments', async () => {
    const tasks: any[] = []
    const schema = buildSchema({ tasks, assessments: undefined })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults).toEqual([])
    expect(consoleWarnSpy).toHaveBeenCalledWith('No assessments found in schema')
  })

  it('evaluates a level with criteria (some met, some not) and builds met list', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'DPIA',
        levels: [
          {
            level: 'required',
            result: 'verplicht',
            explanation: 'standaard verplicht',
            expression: 'criteria.c1 == true',
            criteria: [
              { id: 'c1', expression: 'true', explanation: 'reden een' },
              { id: 'c2', expression: 'false', explanation: 'reden twee' },
            ],
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults).toHaveLength(1)
    const r = store.assessmentResults[0]
    expect(r.required).toBe(true)
    expect(r.criteria).toHaveLength(1)
    expect(r.criteria![0].id).toBe('c1')
    expect(r.explanation).toContain('Een DPIA is verplicht omdat:')
    expect(r.explanation).toContain('reden een')
  })

  it('formatExplanation: recommended level produces "wordt aanbevolen" text', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'DPIA',
        levels: [
          {
            level: 'recommended',
            result: 'aanbevolen',
            explanation: 'standaard aanbevolen',
            expression: 'criteria.c1 == true',
            criteria: [{ id: 'c1', expression: 'true', explanation: 'aanbeveel-reden' }],
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    const r = store.assessmentResults[0]
    expect(r.required).toBe(true)
    expect(r.explanation).toContain('Een DPIA wordt aanbevolen omdat:')
    expect(r.explanation).toContain('aanbeveel-reden')
  })

  it('level without criteria: evaluates plain expression; uses default explanation', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'PRESCAN',
        levels: [
          {
            level: 'not_required',
            result: 'niet nodig',
            explanation: 'geen reden',
            expression: 'true',
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    const r = store.assessmentResults[0]
    expect(r.required).toBe(false)
    expect(r.explanation).toBe('geen reden')
    expect(r.criteria).toBeUndefined()
  })

  it('level with empty criteria array goes through the else (no-criteria) branch', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'EMPTY',
        levels: [
          {
            level: 'not_required',
            result: 'niet nodig',
            explanation: 'leeg',
            expression: 'true',
            criteria: [],
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults[0].explanation).toBe('leeg')
  })

  it('falls back to empty string when level.explanation is missing', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'NOEXP',
        levels: [
          {
            level: 'not_required',
            result: 'niet nodig',
            expression: 'true',
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults[0].explanation).toBe('')
  })

  it('first matching level wins (break) and falls through non-matching levels', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'MULTI',
        levels: [
          {
            level: 'required',
            result: 'verplicht',
            explanation: 'eerst',
            expression: 'false',
          },
          {
            level: 'recommended',
            result: 'aanbevolen',
            explanation: 'tweede',
            expression: 'true',
          },
          {
            level: 'not_required',
            result: 'nooit bereikt',
            explanation: 'derde',
            expression: 'true',
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults).toHaveLength(1)
    expect(store.assessmentResults[0].result).toBe('aanbevolen')
  })

  it('no level matches -> assessment produces no result entry', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'NONE',
        levels: [
          { level: 'required', result: 'r', explanation: 'x', expression: 'false' },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults).toEqual([])
  })

  it('evaluateCriteria: criterion expression error is recorded in calculationErrors', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'CRITERR',
        levels: [
          {
            level: 'required',
            result: 'verplicht',
            explanation: 'standaard',
            expression: 'true',
            criteria: [
              { id: 'bad', expression: '@@@', explanation: 'kapot' },
            ],
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculationErrors.some((e) => e.includes('criterion bad'))).toBe(true)
    expect(store.assessmentResults[0].criteria).toBeUndefined()
  })

  it('evaluateAssessments: error while evaluating a level is caught per assessment', async () => {
    const tasks: any[] = []
    const assessments = [
      {
        id: 'LEVELERR',
        levels: [
          {
            level: 'required',
            result: 'verplicht',
            explanation: 'standaard',
            expression: '@@@',
          },
        ],
      },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.calculationErrors.some((e) => e.includes('LEVELERR assessment'))).toBe(true)
    expect(store.assessmentResults).toEqual([])
  })

  it('sorts assessment results by id', async () => {
    const tasks: any[] = []
    const assessments = [
      { id: 'B', levels: [{ level: 'x', result: 'rb', explanation: 'b', expression: 'true' }] },
      { id: 'A', levels: [{ level: 'x', result: 'ra', explanation: 'a', expression: 'true' }] },
    ]
    const schema = buildSchema({ tasks, assessments })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(store.assessmentResults.map((r) => r.id)).toEqual(['A', 'B'])
  })
})

describe('useCalculationStore - runCalculations', () => {
  it('throws and records an error when no schema is found for the namespace', async () => {
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)

    const store = useCalculationStore()
    await store.runCalculations()

    expect(store.calculationErrors.some((e) => e.includes('No schema found'))).toBe(true)
    expect(store.isCalculating).toBe(false)
  })

  it('clears prior errors on each run and resets scores', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk',
        type: ['text_input'],
        calculation: { expression: '5', scoreKey: 'risk', riskScore: [{ when: 'true', value: 2 }] },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.calculationErrors.push('stale')
    store.calculatedScores.stale = 99

    await store.runCalculations()

    expect(store.calculationErrors).toEqual([])
    expect(store.calculatedScores.stale).toBeUndefined()
    expect(store.calculatedScores.risk).toBe(2)
    expect(store.isCalculating).toBe(false)
  })
})

describe('useCalculationStore - init', () => {
  it('initialises JEXL then runs calculations on first init', async () => {
    const tasks: any[] = []
    const schema = buildSchema({ tasks, assessments: [] })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    expect(consoleLogSpy).toHaveBeenCalledWith('JEXL setup complete')
  })

  it('skips setupJexl on a second init but still runs calculations', async () => {
    const tasks: any[] = []
    const schema = buildSchema({ tasks, assessments: [] })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()
    consoleLogSpy.mockClear()

    store.init()
    await flush()

    expect(consoleLogSpy).not.toHaveBeenCalledWith('JEXL setup complete')
  })
})

describe('useCalculationStore - reset', () => {
  it('clears all state back to defaults', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk',
        type: ['text_input'],
        calculation: { expression: '5', scoreKey: 'risk', riskScore: [{ when: 'true', value: 2 }] },
      },
    ]
    const schema = buildSchema({ tasks })
    setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()
    expect(store.calculatedScores.risk).toBe(2)

    store.reset()

    expect(store.calculatedScores).toEqual({})
    expect(store.assessmentResults).toEqual([])
    expect(store.isCalculating).toBe(false)
    expect(store.calculationErrors).toEqual([])
  })
})

describe('useCalculationStore - answers watch', () => {
  it('re-runs calculations when answers change in PRE_SCAN namespace (initialised)', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk',
        type: ['text_input'],
        calculation: { expression: 'bool(answers("1"))', scoreKey: 'risk', riskScore: [{ when: 'risk == true', value: 7 }] },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.PRE_SCAN, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()
    expect(store.calculatedScores.risk).toBeUndefined()

    answerStore.answers[FormType.PRE_SCAN]['1'] = { value: 'true', lastEditedAt: '2024-01-01' }
    await flush()

    expect(store.calculatedScores.risk).toBe(7)
  })

  it('does NOT re-run calculations when namespace is DPIA (right side of && false)', async () => {
    const tasks: any[] = [
      {
        id: '1',
        task: 'Risk',
        type: ['text_input'],
        calculation: { expression: 'bool(answers("1"))', scoreKey: 'risk', riskScore: [{ when: 'risk == true', value: 7 }] },
      },
    ]
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.DPIA, schema, tasks as Task[])

    const store = useCalculationStore()
    store.init()
    await flush()

    answerStore.answers[FormType.DPIA]['1'] = { value: 'true', lastEditedAt: '2024-01-01' }
    await flush()

    expect(store.calculatedScores.risk).toBeUndefined()
  })

  it('does NOT re-run calculations when store is not initialised (left side of && false)', async () => {
    const tasks: any[] = []
    const schema = buildSchema({ tasks })
    const { answerStore } = setupStores(FormType.PRE_SCAN, schema, tasks as Task[])

    // Create the store (registers the watcher) but never call init() -> isInitialized stays false.
    const store = useCalculationStore()

    answerStore.answers[FormType.PRE_SCAN]['1'] = { value: 'true', lastEditedAt: '2024-01-01' }
    await flush()

    expect(store.calculatedScores).toEqual({})
    expect(store.assessmentResults).toEqual([])
  })
})

// Flush Vue reactivity plus the awaited promises inside async calculation routines.
async function flush() {
  await nextTick()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

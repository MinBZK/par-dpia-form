import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { FormType, type Task } from '../../src/models/dpia'
import type { ImageValue } from '../../src/stores/answers'
import {
  summariseImpact,
  findImpactedByDelete,
  findImpactedByConditionalChange,
  filterVisibleAnswers,
  type ImpactedAnswer,
} from '../../src/utils/impactedAnswers'

let taskStore: ReturnType<typeof useTaskStore>
let answerStore: ReturnType<typeof useAnswerStore>

beforeEach(() => {
  setActivePinia(createPinia())
  taskStore = useTaskStore()
  answerStore = useAnswerStore()
  taskStore.setActiveNamespace(FormType.DPIA)
  answerStore.setActiveNamespace(FormType.DPIA)
})

function answer(value: string | string[] | ImageValue | null) {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

describe('summariseImpact', () => {
  it('groups per root section, dedups + sorts field names, sorts sections numerically', () => {
    const tasks: Task[] = [
      {
        id: '2', task: 'Sectie Twee', type: ['task_group'],
        tasks: [
          { id: '2.1', task: 'Veld A', type: ['text'] },
          { id: '2.2', task: 'Veld B', type: ['text'] },
        ],
      },
      {
        id: '10', task: 'Sectie Tien', type: ['task_group'],
        tasks: [{ id: '10.1', task: 'Veld C', type: ['text'] }],
      },
    ]
    taskStore.init(tasks, true)

    const items: ImpactedAnswer[] = [
      { instanceId: '10.1', taskId: '10.1', value: 'x', reason: 'sync_cascade' },
      { instanceId: '2.2', taskId: '2.2', value: 'y', reason: 'sync_cascade' },
      { instanceId: '2.1', taskId: '2.1', value: 'z', reason: 'sync_cascade' },
      { instanceId: '2.1', taskId: '2.1', value: 'z2', reason: 'sync_cascade' },
    ]

    const summary = summariseImpact(items, taskStore)

    expect(summary.total).toBe(4)
    expect(summary.bySection.map((s) => s.sectionId)).toEqual(['2', '10'])

    const sectionTwo = summary.bySection[0]
    expect(sectionTwo.sectionLabel).toBe('Sectie Twee')
    expect(sectionTwo.count).toBe(3)
    expect(sectionTwo.fieldNames).toEqual(['Veld A', 'Veld B'])

    const sectionTen = summary.bySection[1]
    expect(sectionTen.sectionLabel).toBe('Sectie Tien')
    expect(sectionTen.fieldNames).toEqual(['Veld C'])
  })

  it('falls back to the id when section/field task is unknown (catch branches)', () => {
    taskStore.init([], true)

    const items: ImpactedAnswer[] = [
      { instanceId: '9.9', taskId: '9.9', value: 'v', reason: 'conditional_hidden' },
    ]

    const summary = summariseImpact(items, taskStore)

    expect(summary.total).toBe(1)
    expect(summary.bySection).toHaveLength(1)
    expect(summary.bySection[0].sectionId).toBe('9')
    expect(summary.bySection[0].sectionLabel).toBe('9')
    expect(summary.bySection[0].fieldNames).toEqual(['9.9'])
  })

  it('returns an empty summary for no items', () => {
    taskStore.init([], true)
    const summary = summariseImpact([], taskStore)
    expect(summary).toEqual({ total: 0, bySection: [] })
  })
})

describe('findImpactedByDelete', () => {
  const syncTree: Task[] = [
    {
      id: '3', task: 'Sectie 3', type: ['task_group'],
      tasks: [
        {
          id: '3.1', task: 'Herhaalbaar', type: ['task_group'], repeatable: true,
          tasks: [{ id: '3.1.1', task: 'Naam', type: ['text'] }],
        },
      ],
    },
    {
      id: '6', task: 'Sectie 6', type: ['task_group'],
      tasks: [
        {
          id: '6.1', task: 'Sync doel', type: ['task_group'], repeatable: true,
          dependencies: [
            { type: 'instance_mapping', action: 'sync', source: { id: '3.1.1' } },
          ],
          tasks: [{ id: '6.1.1', task: 'Gesynct', type: ['text'] }],
        },
      ],
    },
  ]

  it('collects answers on the deleted instance + descendants, and cascades via sync mapping', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')

    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
      '3.1.1[0]': answer(''),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)

    const ids = impacted.map((i) => i.instanceId).sort()
    expect(ids).toEqual(['3.1.1[1]', '6.1.1[1]'])
    expect(impacted.every((i) => i.reason === 'sync_cascade')).toBe(true)
    const byId = Object.fromEntries(impacted.map((i) => [i.instanceId, i]))
    expect(byId['3.1.1[1]'].taskId).toBe('3.1.1')
    expect(byId['3.1.1[1]'].value).toBe('Bron')
  })

  it('skips instances already visited (cycle guard) and short-circuits second enqueue', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toHaveLength(2)
  })

  it('skips a non-indexed instance (parsed.index === undefined continue)', () => {
    const tasks: Task[] = [
      { id: '0', task: 'Intro', type: ['task_group'], tasks: [{ id: '0.1', task: 'Naam', type: ['text'] }] },
    ]
    taskStore.init(tasks, true)
    answerStore.answers[FormType.DPIA] = { '0.1': answer('Project') }

    const impacted = findImpactedByDelete('0.1', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('uses empty fallback for answers when namespace map is missing', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    answerStore.answers[FormType.DPIA] = undefined as never

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('does not cascade when a mapping dependency lacks a source id', () => {
    const tree: Task[] = [
      {
        id: '3', task: 'S3', type: ['task_group'],
        tasks: [
          {
            id: '3.1', task: 'Rep', type: ['task_group'], repeatable: true,
            tasks: [{ id: '3.1.1', task: 'Naam', type: ['text'] }],
          },
        ],
      },
      {
        id: '6', task: 'S6', type: ['task_group'],
        tasks: [
          {
            id: '6.1', task: 'Doel', type: ['task_group'], repeatable: true,
            dependencies: [{ type: 'instance_mapping', action: 'sync' }],
            tasks: [{ id: '6.1.1', task: 'X', type: ['text'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['3.1.1[1]'])
  })

  it('does not cascade when mapping source is not a descendant task id', () => {
    const tree: Task[] = [
      {
        id: '3', task: 'S3', type: ['task_group'],
        tasks: [
          {
            id: '3.1', task: 'Rep', type: ['task_group'], repeatable: true,
            tasks: [{ id: '3.1.1', task: 'Naam', type: ['text'] }],
          },
        ],
      },
      {
        id: '6', task: 'S6', type: ['task_group'],
        tasks: [
          {
            id: '6.1', task: 'Doel', type: ['task_group'], repeatable: true,
            dependencies: [{ type: 'instance_mapping', action: 'sync', source: { id: '9.9.9' } }],
            tasks: [{ id: '6.1.1', task: 'X', type: ['text'] }],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['3.1.1[1]'])
  })

  it('does not enqueue when the target sync instance does not exist at the same index', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['3.1.1[1]'])
  })

  it('tolerates a dangling child id and a task with no childrenIds (collectDescendantTaskIds edge branches)', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const ns = FormType.DPIA
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = ['nonexistent-task']
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = undefined as never

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('walks a dangling child id without crashing (collectDescendantTaskIds !task continue)', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }
    const ns = FormType.DPIA
    taskStore.flatTasks[ns]['3.1'].childrenIds = ['3.1.1', 'ghost-task']

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('skips a task id already in the descendant set (cyclic childrenIds — !result.has false)', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }
    const ns = FormType.DPIA
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = ['3.1']

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('guards against an already-visited instance via a mutual sync mapping (visited continue)', () => {
    const mutualTree: Task[] = [
      {
        id: '3', task: 'S3', type: ['task_group'],
        tasks: [
          {
            id: '3.1', task: 'Rep3', type: ['task_group'], repeatable: true,
            dependencies: [{ type: 'instance_mapping', action: 'sync', source: { id: '6.1.1' } }],
            tasks: [{ id: '3.1.1', task: 'Naam', type: ['text'] }],
          },
        ],
      },
      {
        id: '6', task: 'S6', type: ['task_group'],
        tasks: [
          {
            id: '6.1', task: 'Rep6', type: ['task_group'], repeatable: true,
            dependencies: [{ type: 'instance_mapping', action: 'sync', source: { id: '3.1.1' } }],
            tasks: [{ id: '6.1.1', task: 'Gesynct', type: ['text'] }],
          },
        ],
      },
    ]
    taskStore.init(mutualTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('returns [instanceId] from collectDescendantInstances when instance is unknown', () => {
    taskStore.init(syncTree, true)
    answerStore.answers[FormType.DPIA] = {}

    const impacted = findImpactedByDelete('3.1[7]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('collects array and image answers, and skips empty-array values (hasValue branches)', () => {
    const img: ImageValue = { data: 'data:image/png;base64,abc', title: 'Verwerkingsdiagram', source: 'diagram.png' }
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer(['E-mailadres', 'Telefoonnummer']),
      '6.1.1[1]': answer(img),
      '3.1.1[0]': answer([]),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    const byId = Object.fromEntries(impacted.map((i) => [i.instanceId, i.value]))
    expect(Object.keys(byId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
    expect(byId['3.1.1[1]']).toEqual(['E-mailadres', 'Telefoonnummer'])
    expect(byId['6.1.1[1]']).toEqual(img)
  })

  it('skips a null-valued answer (hasValue value == null branch)', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer(null),
    }
    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('collectDescendantTaskIds tolerates tasks with missing childrenIds', () => {
    taskStore.init(syncTree, true)
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[0]': answer('Bron0'),
      '6.1.1[0]': answer('Doel0'),
    }

    const impacted = findImpactedByDelete('3.1[0]', taskStore, answerStore)
    const ids = impacted.map((i) => i.instanceId).sort()
    expect(ids).toEqual(['3.1.1[0]', '6.1.1[0]'])
  })
})

describe('findImpactedByConditionalChange', () => {
  const condTree: Task[] = [
    {
      id: '1', task: 'Sectie 1', type: ['task_group'],
      tasks: [
        { id: '1.1', task: 'Toon vervolg?', type: ['radio'] },
        {
          id: '1.2', task: 'Vervolgveld', type: ['text'],
          dependencies: [
            { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: 'true' } },
          ],
        },
      ],
    },
  ]

  it('returns [] when no task depends on the changed condition', () => {
    const tasks: Task[] = [
      { id: '1', task: 'S', type: ['task_group'], tasks: [{ id: '1.1', task: 'X', type: ['radio'] }] },
    ]
    taskStore.init(tasks, true)
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('falls back to an empty answer map when the namespace answers are missing', () => {
    const noDeps: Task[] = [
      { id: '1', task: 'S', type: ['task_group'], tasks: [{ id: '1.1', task: 'X', type: ['radio'] }] },
    ]
    taskStore.init(noDeps, true)
    answerStore.answers[FormType.DPIA] = undefined as never
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('returns [] when the next value equals the original value', () => {
    taskStore.init(condTree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Ingevulde tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'true', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('flags a visible dependent answer that would become hidden', () => {
    taskStore.init(condTree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Ingevulde tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toHaveLength(1)
    expect(impacted[0].instanceId).toBe('1.2')
    expect(impacted[0].taskId).toBe('1.2')
    expect(impacted[0].value).toBe('Ingevulde tekst')
    expect(impacted[0].reason).toBe('conditional_hidden')
  })

  it('skips dependent instances that have no value (hasValue false)', () => {
    taskStore.init(condTree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('does not flag when the answer would stay visible', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'X', type: ['radio'] },
          {
            id: '1.2', task: 'Y', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'any' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Blijft zichtbaar'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('skips dependent instances at a different index than the changed instance', () => {
    const tree: Task[] = [
      {
        id: '2', task: 'S2', type: ['task_group'],
        tasks: [
          {
            id: '2.1', task: 'Rep', type: ['task_group'], repeatable: true,
            tasks: [
              { id: '2.1.1', task: 'Schakel', type: ['radio'] },
              {
                id: '2.1.2', task: 'Detail', type: ['text'],
                dependencies: [
                  { type: 'conditional', action: 'show', condition: { id: '2.1.1', operator: 'equals', value: 'true' } },
                ],
              },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    taskStore.addRepeatableTaskInstance('2.1')
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': answer('true'),
      '2.1.2[0]': answer('Detail 0'),
      '2.1.1[1]': answer('true'),
      '2.1.2[1]': answer('Detail 1'),
    }
    const impacted = findImpactedByConditionalChange('2.1.1[0]', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['2.1.2[0]'])
  })
})

describe('wouldBeHiddenUnder (via findImpactedByConditionalChange)', () => {
  it('uses the override value for the changed instance and resolves others from the store', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          { id: '1.2', task: 'B', type: ['radio'] },
          {
            id: '1.3', task: 'C', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'true' } },
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: 'true' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('true'),
      '1.3': answer('Tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.3'])
  })

  it('contains operator on an array value (override) keeps it visible when included, hides when not', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'Keuze', type: ['checkbox'] },
          {
            id: '1.2', task: 'Detail', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'contains', value: 'x' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer(['x', 'y']),
      '1.2': answer('Detail'),
    }
    const impactedHidden = findImpactedByConditionalChange('1.1', ['y'], taskStore, answerStore)
    expect(impactedHidden.map((i) => i.instanceId)).toEqual(['1.2'])

    const impactedVisible = findImpactedByConditionalChange('1.1', ['x', 'z'], taskStore, answerStore)
    expect(impactedVisible).toEqual([])
  })

  it('contains operator on a non-array override compares by equality', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'Keuze', type: ['checkbox'] },
          {
            id: '1.2', task: 'Detail', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'contains', value: 'x' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer(['x']),
      '1.2': answer('Detail'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'andere', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.2'])
  })

  it('skips a conditional dependency whose condition value is null/undefined', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          {
            id: '1.2', task: 'B', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: null } },
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: 'true' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.2'])
  })

  it('non-show actions and non-conditional deps never hide (returns false)', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          {
            id: '1.2', task: 'B', type: ['text'],
            dependencies: [
              { type: 'instance_mapping', action: 'sync', source: { id: '9.9' } },
              { type: 'conditional', action: 'hide', condition: { id: '1.1', operator: 'equals', value: 'true' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('operator "any" with a non-null value is always met → never hidden', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          {
            id: '1.2', task: 'B', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'any', value: 'irrelevant' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Blijft'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('unknown operator leaves conditionMet false → hidden under show action', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          {
            id: '1.2', task: 'B', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'unknown', value: 'x' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Tekst'),
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.2'])
  })

  it('skips a conditional whose related instance cannot be resolved', () => {
    const tree: Task[] = [
      {
        id: '1', task: 'S1', type: ['task_group'],
        tasks: [
          { id: '1.1', task: 'A', type: ['radio'] },
          {
            id: '1.2', task: 'B', type: ['text'],
            dependencies: [
              { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: 'true' } },
            ],
          },
        ],
      },
    ]
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.2': answer('Tekst'),
    }
    delete taskStore.taskInstances[FormType.DPIA]['1.1']
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })
})

describe('filterVisibleAnswers', () => {
  const tree: Task[] = [
    {
      id: '1', task: 'S1', type: ['task_group'],
      tasks: [
        { id: '1.1', task: 'Schakel', type: ['radio'] },
        {
          id: '1.2', task: 'Detail', type: ['text'],
          dependencies: [
            { type: 'conditional', action: 'show', condition: { id: '1.1', operator: 'equals', value: true } },
          ],
        },
      ],
    },
  ]

  it('keeps visible answers and drops hidden ones', () => {
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('false'),
      '1.2': answer('Verborgen detail'),
    }
    const filtered = filterVisibleAnswers(
      { '1.1': answer('false'), '1.2': answer('Verborgen detail') },
      taskStore,
      answerStore,
    )
    expect(Object.keys(filtered)).toEqual(['1.1'])
  })

  it('keeps the visible dependent answer when its condition is met', () => {
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Zichtbaar detail'),
    }
    const filtered = filterVisibleAnswers(
      { '1.1': answer('true'), '1.2': answer('Zichtbaar detail') },
      taskStore,
      answerStore,
    )
    expect(Object.keys(filtered).sort()).toEqual(['1.1', '1.2'])
  })

  it('keeps answers for tasks not registered in the schema (data-loss guard)', () => {
    taskStore.init(tree, true)
    const filtered = filterVisibleAnswers(
      { '99.99': answer('Stale waarde') },
      taskStore,
      answerStore,
    )
    expect(filtered).toEqual({ '99.99': answer('Stale waarde') })
  })

  it('falls back to an empty task map when the namespace flatTasks are nullish (?? branch)', () => {
    taskStore.init(tree, true)
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.DPIA]
    const filtered = filterVisibleAnswers(
      { '1.1': answer('Inleiding') },
      taskStore,
      answerStore,
    )
    expect(filtered).toEqual({ '1.1': answer('Inleiding') })
  })
})

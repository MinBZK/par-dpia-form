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

// ---------------------------------------------------------------------------
// Shared helpers — build real Pinia stores so the source exercises the real
// taskStore/answerStore implementations (parseInstanceId, getInstanceById,
// getInstancesForTask, findRelatedInstance, getAnswer, shouldShowTask).
// ---------------------------------------------------------------------------

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
    // Two root sections "2" and "10" so numeric (not lexical) sort is exercised.
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
      // Duplicate field name for section 2 — must collapse via Set.
      { instanceId: '2.1', taskId: '2.1', value: 'z2', reason: 'sync_cascade' },
    ]

    const summary = summariseImpact(items, taskStore)

    expect(summary.total).toBe(4)
    // Sorted numerically: 2 before 10.
    expect(summary.bySection.map((s) => s.sectionId)).toEqual(['2', '10'])

    const sectionTwo = summary.bySection[0]
    expect(sectionTwo.sectionLabel).toBe('Sectie Twee')
    // count = total fields pushed for the section (incl. duplicate) = 3.
    expect(sectionTwo.count).toBe(3)
    // fieldNames deduped + sorted alphabetically.
    expect(sectionTwo.fieldNames).toEqual(['Veld A', 'Veld B'])

    const sectionTen = summary.bySection[1]
    expect(sectionTen.sectionLabel).toBe('Sectie Tien')
    expect(sectionTen.fieldNames).toEqual(['Veld C'])
  })

  it('falls back to the id when section/field task is unknown (catch branches)', () => {
    // No tasks registered → taskById throws → both sectionLabel and fieldName catch.
    taskStore.init([], true)

    const items: ImpactedAnswer[] = [
      { instanceId: '9.9', taskId: '9.9', value: 'v', reason: 'conditional_hidden' },
    ]

    const summary = summariseImpact(items, taskStore)

    expect(summary.total).toBe(1)
    expect(summary.bySection).toHaveLength(1)
    expect(summary.bySection[0].sectionId).toBe('9')
    expect(summary.bySection[0].sectionLabel).toBe('9') // catch → sectionId
    expect(summary.bySection[0].fieldNames).toEqual(['9.9']) // catch → taskId
  })

  it('returns an empty summary for no items', () => {
    taskStore.init([], true)
    const summary = summariseImpact([], taskStore)
    expect(summary).toEqual({ total: 0, bySection: [] })
  })
})

describe('findImpactedByDelete', () => {
  // Tree with a repeatable group 3.1 (text child 3.1.1) and a sync target 6.1
  // (text child 6.1.1) whose instance_mapping source points at 3.1.1.
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
    // Add a second instance (index 1) for both repeatable groups so the
    // mapping cascade targets 6.1[1] from 3.1[1].
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')

    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
      // An empty-string answer that must be skipped by hasValue.
      '3.1.1[0]': answer(''),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)

    const ids = impacted.map((i) => i.instanceId).sort()
    // 3.1.1[1] (descendant of deleted) and 6.1.1[1] (sync cascade target).
    expect(ids).toEqual(['3.1.1[1]', '6.1.1[1]'])
    expect(impacted.every((i) => i.reason === 'sync_cascade')).toBe(true)
    const byId = Object.fromEntries(impacted.map((i) => [i.instanceId, i]))
    expect(byId['3.1.1[1]'].taskId).toBe('3.1.1')
    expect(byId['3.1.1[1]'].value).toBe('Bron')
  })

  it('skips instances already visited (cycle guard) and short-circuits second enqueue', () => {
    // Deleting 3.1[1] enqueues 6.1[1] (via mapping). If 6.1 also mapped back to
    // a descendant of itself we would re-enqueue, but the visited-set prevents
    // an infinite loop. Here we delete an instance, and assert it terminates.
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
    // Non-repeatable instance id "0.1" has no index.
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
    // Wipe the namespace answer map entirely → `answerStore.answers[ns] || {}`
    // falls back to {} and no answers are collected.
    answerStore.answers[FormType.DPIA] = undefined as never

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('does not cascade when a mapping dependency lacks a source id', () => {
    // 6.1 has an instance_mapping dependency but with no source id → skipped.
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
            // No `source` → `mappingDep?.source?.id` is falsy → continue.
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
    // Only the deleted instance's own descendant — no cascade.
    expect(impacted.map((i) => i.instanceId)).toEqual(['3.1.1[1]'])
  })

  it('does not cascade when mapping source is not a descendant task id', () => {
    // Mapping source "9.9.9" is unrelated to 3.1's descendants → continue.
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
    // 6.1 maps from 3.1.1, but there is no 6.1[1] instance (only the default
    // 6.1[0]). getInstanceById('6.1[1]') is null → `if (targetInstance)` false.
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1') // creates 3.1[1] only
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer('Bron'),
      '6.1.1[1]': answer('Doel'),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    // 6.1.1[1] is NOT collected because the 6.1[1] instance does not exist.
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
    // Add a dangling child id to 3.1.1 → `!task` continue branch (L101) when the
    // graph walk dereferences the missing task.
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = ['nonexistent-task']
    // Strip childrenIds from 3.1.1 of the *6* branch's perspective is not needed;
    // instead remove childrenIds from the dangling visit target by making one
    // task have an undefined childrenIds → `task.childrenIds || []` (L102).
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = undefined as never

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    // Cascade still works; the graph walk does not crash on undefined childrenIds.
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
    // 3.1 lists a child that does not exist in flatTasks → queued, then `!task`
    // continue at L101.
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
    // Introduce a cycle in the task graph: 3.1.1 → 3.1 (back-reference). When the
    // walk reaches 3.1.1 it re-queues 3.1, which is already in the result set →
    // `!result.has(childId)` is false → the id is not added again (L103 else).
    taskStore.flatTasks[ns]['3.1.1'].childrenIds = ['3.1']

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('guards against an already-visited instance via a mutual sync mapping (visited continue)', () => {
    // 3.1.1 ↔ 6.1.1 mutual mapping: deleting 3.1[1] enqueues 6.1[1], whose
    // mapping points back at 3.1[1] (already visited → continue at L148).
    const mutualTree: Task[] = [
      {
        id: '3', task: 'S3', type: ['task_group'],
        tasks: [
          {
            id: '3.1', task: 'Rep3', type: ['task_group'], repeatable: true,
            // 3.1 maps from 6.1.1 (back-reference).
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
            // 6.1 maps from 3.1.1 (forward-reference).
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
    // Both collected exactly once despite the mutual reference (no infinite loop).
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
  })

  it('returns [instanceId] from collectDescendantInstances when instance is unknown', () => {
    // Delete an indexed instance whose TaskInstance does not exist in the store.
    // parseInstanceId yields index, getInstanceById('3.1[7]') is null, so
    // collectDescendantInstances returns just ['3.1[7]'] (no answer → nothing).
    taskStore.init(syncTree, true)
    answerStore.answers[FormType.DPIA] = {}

    const impacted = findImpactedByDelete('3.1[7]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('collects array and image answers, and skips empty-array values (hasValue branches)', () => {
    // 3.1.1[1] = non-empty array (hasValue → array.length > 0 true)
    // 6.1.1[1] = ImageValue object (hasValue → return true)
    // 3.1.1[0] = empty array (hasValue → array.length > 0 false → skipped)
    const img: ImageValue = { data: 'data:image/png;base64,abc', title: 'T', source: 's.png' }
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    taskStore.addRepeatableTaskInstance('6.1')
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[1]': answer(['a', 'b']),
      '6.1.1[1]': answer(img),
      '3.1.1[0]': answer([]),
    }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    const byId = Object.fromEntries(impacted.map((i) => [i.instanceId, i.value]))
    expect(Object.keys(byId).sort()).toEqual(['3.1.1[1]', '6.1.1[1]'])
    expect(byId['3.1.1[1]']).toEqual(['a', 'b'])
    expect(byId['6.1.1[1]']).toEqual(img)
  })

  it('skips a null-valued answer (hasValue value == null branch)', () => {
    taskStore.init(syncTree, true)
    taskStore.addRepeatableTaskInstance('3.1')
    answerStore.answers[FormType.DPIA] = {
      // Explicit null value → hasValue returns false.
      '3.1.1[1]': answer(null),
    }
    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('collectDescendantTaskIds tolerates tasks with missing childrenIds', () => {
    // This indirectly exercises the `task.childrenIds || []` and `!task` paths
    // by deleting a real instance and walking the flat task graph. The default
    // repeatable instance 3.1[0] has child 3.1.1[0].
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
  // Section 1: a radio condition 1.1 controls visibility of 1.2 (show when equals "true").
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
    // No conditional dependents → the function returns right after the empty-map
    // fallback (`answers[ns] || {}`) and before getAnswer is ever called.
    const noDeps: Task[] = [
      { id: '1', task: 'S', type: ['task_group'], tasks: [{ id: '1.1', task: 'X', type: ['radio'] }] },
    ]
    taskStore.init(noDeps, true)
    // Wipe the namespace answer map → `answerStore.answers[ns] || {}` takes the
    // `|| {}` branch.
    answerStore.answers[FormType.DPIA] = undefined as never
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('returns [] when the next value equals the original value', () => {
    taskStore.init(condTree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Some text'),
    }
    // originalValue === nextValue → early return.
    const impacted = findImpactedByConditionalChange('1.1', 'true', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('flags a visible dependent answer that would become hidden', () => {
    taskStore.init(condTree, true)
    answerStore.answers[FormType.DPIA] = {
      '1.1': answer('true'),
      '1.2': answer('Ingevulde tekst'),
    }
    // Changing 1.1 from "true" to "false" hides 1.2 (show-when-equals-true).
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
      // 1.2 has no answer at all.
    }
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted).toEqual([])
  })

  it('does not flag when the answer would stay visible', () => {
    // Condition operator "any" → always met → dependent never hidden.
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
    // Repeatable group 2.1 with a per-instance conditional (2.1.1 controls 2.1.2).
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
    taskStore.addRepeatableTaskInstance('2.1') // index 1
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': answer('true'),
      '2.1.2[0]': answer('Detail 0'),
      '2.1.1[1]': answer('true'),
      '2.1.2[1]': answer('Detail 1'),
    }
    // Changing the index-0 condition only affects index-0 dependents; the
    // index-1 instance is skipped by the index-mismatch continue.
    const impacted = findImpactedByConditionalChange('2.1.1[0]', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['2.1.2[0]'])
  })
})

describe('wouldBeHiddenUnder (via findImpactedByConditionalChange)', () => {
  it('uses the override value for the changed instance and resolves others from the store', () => {
    // Two conditions on 1.3: one on 1.1 (being changed → uses override), one on
    // 1.2 (unchanged → read from store, condition met so stays visible from it,
    // but 1.1 hides it). Exercises both branches of the override ternary.
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
    // Change 1.1 → "false". The 1.2 dependency reads from the store (still met),
    // the 1.1 dependency reads the override (not met) → hidden.
    const impacted = findImpactedByConditionalChange('1.1', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.3'])
  })

  it('contains operator on an array value (override) keeps it visible when included, hides when not', () => {
    // checkbox condition 1.1 (array) controls 1.2 via contains "x".
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
    // Change 1.1 to an array NOT containing "x" → condition not met → hidden.
    const impactedHidden = findImpactedByConditionalChange('1.1', ['y'], taskStore, answerStore)
    expect(impactedHidden.map((i) => i.instanceId)).toEqual(['1.2'])

    // Change 1.1 to an array still containing "x" → condition met → visible.
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
    // Override with a non-array string that is not equal to "x" → hidden.
    const impacted = findImpactedByConditionalChange('1.1', 'andere', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['1.2'])
  })

  it('skips a conditional dependency whose condition value is null/undefined', () => {
    // The dependent has TWO conditionals on 1.1: one with a null value (skipped
    // inside wouldBeHiddenUnder), one with a real value (drives hiding). Both
    // match conditionTaskId so the dependent enters the loop.
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
    // The dependent task selected by findImpactedByConditionalChange has a
    // conditional on 1.1 with action 'hide' (not 'show') plus an 'instance_mapping'
    // dep. wouldBeHiddenUnder must return false → nothing flagged.
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
    // The dependency carries a value (so it passes the null/undefined guard) but
    // uses operator "any", exercising the `conditionMet = true` assignment.
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
    // operator is neither equals/any/contains → falls through the if-chain
    // (final implicit else) leaving conditionMet false → show && !false → hidden.
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
    // The dependent (1.2) is selected because it has a conditional on 1.1, but
    // wouldBeHiddenUnder's findRelatedInstance returns null when no instance in
    // the same group has taskId 1.1. We delete the 1.1 instance so the lookup
    // fails for the dependent → continue → returns false → not flagged.
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
    // Remove the 1.1 instance from the store so findRelatedInstance returns null.
    delete taskStore.taskInstances[FormType.DPIA]['1.1']
    // nextValue differs from original (null) so we get past the early return.
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
          // Boolean condition value so normalizeValue('true') === true matches.
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
    // 1.1 always visible; 1.2 hidden because 1.1 !== "true".
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
    // Remove the namespace's flatTasks entirely → `flatTasks[ns] ?? {}` takes the
    // `?? {}` branch. Every taskId is then unregistered → kept (data-loss guard).
    delete (taskStore.flatTasks as Record<string, unknown>)[FormType.DPIA]
    const filtered = filterVisibleAnswers(
      { '1.1': answer('x') },
      taskStore,
      answerStore,
    )
    expect(filtered).toEqual({ '1.1': answer('x') })
  })
})

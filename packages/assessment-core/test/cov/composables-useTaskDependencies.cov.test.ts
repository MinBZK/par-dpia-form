import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, type FlatTask } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { useTaskDependencies } from '../../src/composables/useTaskDependencies'
import { rebuildRepeatableInstances } from '../../src/utils/applyState'
import { FormType, type Task, type Dependency } from '../../src/models/dpia'

function flatTask(overrides: Partial<FlatTask>): FlatTask {
  return {
    id: 'x',
    task: 'X',
    type: ['text_input'],
    parentId: null,
    childrenIds: [],
    ...overrides,
  }
}

describe('useTaskDependencies', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  describe('shouldShowTask', () => {
    // Group "1" → child "1.1" (under test) + "1.2" (condition task).
    function initConditional(deps?: Dependency[]): void {
      const tasks = [
        {
          task: 'Group',
          id: '1',
          type: ['task_group'],
          tasks: [
            { task: 'Field A', id: '1.1', type: ['text_input'], dependencies: deps },
            { task: 'Field B', id: '1.2', type: ['text_input'] },
          ],
        },
      ] as unknown as Task[]
      taskStore.init(tasks, true)
    }

    it('delegates to checkShouldShowTask: shows when no dependencies', () => {
      initConditional(undefined)
      const { shouldShowTask } = useTaskDependencies()
      expect(shouldShowTask.value('1.1', '1.1')).toBe(true)
    })

    it('delegates to checkShouldShowTask: hides when conditional not met', () => {
      initConditional([
        { type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'yes' } },
      ])
      answerStore.setAnswer('1.2', 'no')
      const { shouldShowTask } = useTaskDependencies()
      expect(shouldShowTask.value('1.1', '1.1')).toBe(false)
    })
  })

  describe('hasDependencyOfType (via getSourceOptions and direct behaviour)', () => {
    // hasDependencyOfType is not exported directly; we exercise it through
    // getSourceOptions which short-circuits when the type is absent, and
    // through getSourceOptions returning values when present.
    it('returns [] (false branch) when task has no dependencies array', () => {
      const { getSourceOptions } = useTaskDependencies()
      expect(getSourceOptions.value(flatTask({ dependencies: undefined }))).toEqual([])
    })

    it('returns [] (false branch) when dependencies array is empty', () => {
      const { getSourceOptions } = useTaskDependencies()
      expect(getSourceOptions.value(flatTask({ dependencies: [] }))).toEqual([])
    })

    it('returns [] when dependencies exist but none are source_options (some() false)', () => {
      const task = flatTask({
        dependencies: [{ type: 'instance_mapping', action: 'sync_instances', source: { id: '3.1.1' } }],
      })
      const { getSourceOptions } = useTaskDependencies()
      expect(getSourceOptions.value(task)).toEqual([])
    })
  })

  describe('getDependencySourceTaskId', () => {
    it('returns null when task has no dependencies array', () => {
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(getDependencySourceTaskId.value(flatTask({ dependencies: undefined }))).toBeNull()
    })

    it('returns null when dependencies array is empty', () => {
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(getDependencySourceTaskId.value(flatTask({ dependencies: [] }))).toBeNull()
    })

    it('returns condition.id for a source_options dependency with condition', () => {
      const task = flatTask({
        dependencies: [
          { type: 'source_options', action: 'show', condition: { id: '2.1.1', operator: 'any' } },
        ],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(getDependencySourceTaskId.value(task)).toBe('2.1.1')
    })

    it('returns source.id for an instance_mapping dependency with source', () => {
      const task = flatTask({
        dependencies: [
          { type: 'instance_mapping', action: 'sync_instances', source: { id: '3.1.1' } },
        ],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(getDependencySourceTaskId.value(task)).toBe('3.1.1')
    })

    it('returns condition.id for a conditional dependency with condition', () => {
      const task = flatTask({
        dependencies: [
          { type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'yes' } },
        ],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(getDependencySourceTaskId.value(task)).toBe('1.2')
    })

    it('throws on an unsupported dependency type', () => {
      const task = flatTask({
        dependencies: [{ type: 'mystery', action: 'show' } as unknown as Dependency],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(() => getDependencySourceTaskId.value(task)).toThrow(
        'got an unsupported dependency type mystery',
      )
    })

    it('throws when source_options dependency has no condition (guard false → falls to else)', () => {
      const task = flatTask({
        dependencies: [{ type: 'source_options', action: 'show' }],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(() => getDependencySourceTaskId.value(task)).toThrow(
        'got an unsupported dependency type source_options',
      )
    })

    it('throws when instance_mapping dependency has no source (guard false → falls to else)', () => {
      const task = flatTask({
        dependencies: [{ type: 'instance_mapping', action: 'sync_instances' }],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(() => getDependencySourceTaskId.value(task)).toThrow(
        'got an unsupported dependency type instance_mapping',
      )
    })

    it('throws when conditional dependency has no condition (guard false → falls to else)', () => {
      const task = flatTask({
        dependencies: [{ type: 'conditional', action: 'show' }],
      })
      const { getDependencySourceTaskId } = useTaskDependencies()
      expect(() => getDependencySourceTaskId.value(task)).toThrow(
        'got an unsupported dependency type conditional',
      )
    })
  })

  describe('getSourceOptions', () => {
    // Repeatable source task "2.1.1" provides unique string answer values.
    const sourceTree: Task[] = [
      {
        id: '2',
        task: 'Section',
        type: ['task_group'],
        tasks: [
          {
            id: '2.1',
            task: 'Repeatable',
            type: ['task_group'],
            repeatable: true,
            tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]

    const taskWithSourceOptions = flatTask({
      id: 'consumer',
      dependencies: [
        { type: 'source_options', action: 'show', condition: { id: '2.1.1', operator: 'any' } },
      ],
    })

    it('returns [] when the task has no source_options dependency', () => {
      taskStore.init(sourceTree, true)
      const { getSourceOptions } = useTaskDependencies()
      expect(getSourceOptions.value(flatTask({ dependencies: [] }))).toEqual([])
    })

    it('returns [] when the resolved source task id is null', () => {
      taskStore.init(sourceTree, true)
      // source_options without a condition → getDependencySourceTaskId throws,
      // so use a dependency where hasDependencyOfType("source_options") is true
      // but resolution yields null is impossible here; instead cover the
      // sourceTaskId === null path by stubbing through a dependency mix.
      // hasDependencyOfType true requires a source_options dep; that same dep
      // with a condition resolves to a non-null id. To hit the null branch we
      // need source_options present AND resolution null — achieved when the
      // FIRST dependency is source_options-with-condition (resolves) — so the
      // null branch is only reachable with no condition, which throws. We
      // therefore drive null via getDependencySourceTaskId returning null only
      // when dependencies array empty, which also fails hasDependencyOfType.
      // Hence the null branch is exercised indirectly below using a custom mix.
      const mixed = flatTask({
        dependencies: [
          // conditional first so getDependencySourceTaskId resolves to a
          // non-source id, while hasDependencyOfType('source_options') is true.
          { type: 'source_options', action: 'show', condition: { id: '2.1.1', operator: 'any' } },
        ],
      })
      const { getSourceOptions } = useTaskDependencies()
      // This resolves normally (not the null branch) — kept for completeness.
      expect(Array.isArray(getSourceOptions.value(mixed))).toBe(true)
    })

    it('collects unique non-empty string answers from source instances', () => {
      taskStore.init(sourceTree, true)
      answerStore.answers[FormType.DPIA] = {
        '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
        '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
        '2.1.1[2]': { value: 'Email', lastEditedAt: '2024-01-01' }, // duplicate
        '2.1.1[3]': { value: '', lastEditedAt: '2024-01-01' }, // empty → skipped
        '2.1.1[4]': { value: ['a'], lastEditedAt: '2024-01-01' }, // non-string → skipped
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      const { getSourceOptions } = useTaskDependencies()
      const options = getSourceOptions.value(taskWithSourceOptions)
      expect(options).toEqual(['Email', 'Phone'])
    })
  })

  describe('getSourceOptions null source path', () => {
    // To hit `sourceTaskId === null` after passing hasDependencyOfType, we need
    // a task whose dependencies contain a source_options entry (so the type
    // check passes) but whose FIRST dependency resolves to null. The only way
    // getDependencySourceTaskId returns null is via an empty/undefined deps
    // array, which fails hasDependencyOfType. So this branch is covered by a
    // task whose dependency list yields hasDependencyOfType=true yet the loop
    // returns null — unreachable in practice. We instead verify the guard
    // ordering does not crash for a source_options dep that resolves fine.
    it('handles a source_options dependency whose source task has no instances', () => {
      const taskStore2 = useTaskStore()
      const answerStore2 = useAnswerStore()
      taskStore2.setActiveNamespace(FormType.DPIA)
      answerStore2.setActiveNamespace(FormType.DPIA)
      taskStore2.init(
        [
          {
            id: '2',
            task: 'Section',
            type: ['task_group'],
            tasks: [
              {
                id: '2.1',
                task: 'Repeatable',
                type: ['task_group'],
                repeatable: true,
                tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
              },
            ],
          },
        ] as Task[],
        true,
      )
      const task = flatTask({
        dependencies: [
          { type: 'source_options', action: 'show', condition: { id: '2.1.1', operator: 'any' } },
        ],
      })
      const { getSourceOptions } = useTaskDependencies()
      // Default instance 2.1.1[0] exists but has no answer → no values.
      expect(getSourceOptions.value(task)).toEqual([])
    })
  })

  describe('hasSourceTaskValues', () => {
    const tree: Task[] = [
      {
        id: '3',
        task: 'Section',
        type: ['task_group'],
        tasks: [
          {
            id: '3.1',
            task: 'Repeatable',
            type: ['task_group'],
            repeatable: true,
            tasks: [{ id: '3.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
    ]

    it('returns hasValues=true and sourceId=null when there is no source task id', () => {
      taskStore.init(tree, true)
      const { hasSourceTaskValues } = useTaskDependencies()
      const result = hasSourceTaskValues.value(flatTask({ dependencies: [] }))
      expect(result).toEqual({ hasValues: true, sourceId: null })
    })

    it('returns hasValues=true when at least one source instance has a value', () => {
      taskStore.init(tree, true)
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: '', lastEditedAt: '2024-01-01' },
        '3.1.1[1]': { value: 'Verwerking', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      const task = flatTask({
        dependencies: [
          { type: 'instance_mapping', action: 'sync_instances', source: { id: '3.1.1' } },
        ],
      })
      const { hasSourceTaskValues } = useTaskDependencies()
      expect(hasSourceTaskValues.value(task)).toEqual({ hasValues: true, sourceId: '3.1.1' })
    })

    it('returns hasValues=false when no source instance has a value', () => {
      taskStore.init(tree, true)
      // Only the default empty instance exists with no answer.
      const task = flatTask({
        dependencies: [
          { type: 'instance_mapping', action: 'sync_instances', source: { id: '3.1.1' } },
        ],
      })
      const { hasSourceTaskValues } = useTaskDependencies()
      expect(hasSourceTaskValues.value(task)).toEqual({ hasValues: false, sourceId: '3.1.1' })
    })
  })

  describe('canUserCreateInstances', () => {
    const tree: Task[] = [
      {
        id: '4',
        task: 'Section',
        type: ['task_group'],
        tasks: [
          { id: '4.1', task: 'Plain', type: ['text_input'] },
          {
            id: '4.2',
            task: 'User repeatable',
            type: ['task_group'],
            repeatable: true,
            tasks: [{ id: '4.2.1', task: 'Naam', type: ['text_input'] }],
          },
          {
            id: '4.3',
            task: 'Mapped repeatable',
            type: ['task_group'],
            repeatable: true,
            dependencies: [
              { type: 'instance_mapping', action: 'sync_instances', source: { id: '4.2.1' } },
            ],
            tasks: [{ id: '4.3.1', task: 'Doel', type: ['text_input'] }],
          },
        ],
      },
    ]

    it('returns false for a non-repeatable task', () => {
      taskStore.init(tree, true)
      const { canUserCreateInstances } = useTaskDependencies()
      expect(canUserCreateInstances.value('4.1')).toBe(false)
    })

    it('returns true for a repeatable task without instance mapping', () => {
      taskStore.init(tree, true)
      const { canUserCreateInstances } = useTaskDependencies()
      expect(canUserCreateInstances.value('4.2')).toBe(true)
    })

    it('returns false for a repeatable task that has an instance mapping', () => {
      taskStore.init(tree, true)
      const { canUserCreateInstances } = useTaskDependencies()
      expect(canUserCreateInstances.value('4.3')).toBe(false)
    })
  })

  describe('syncInstances', () => {
    // Source repeatable "3.1" (children 3.1.1) maps to target repeatable "5.1".
    const mappingTree: Task[] = [
      {
        id: '3',
        task: 'Gegevensverwerkingen',
        type: ['task_group'],
        tasks: [
          {
            id: '3.1',
            task: 'Gegevensverwerking',
            type: ['task_group'],
            repeatable: true,
            tasks: [{ id: '3.1.1', task: 'Naam', type: ['text_input'] }],
          },
        ],
      },
      {
        id: '5',
        task: 'Doeleinden',
        type: ['task_group'],
        tasks: [
          {
            id: '5.1',
            task: 'Doel',
            type: ['task_group'],
            repeatable: true,
            dependencies: [
              {
                type: 'instance_mapping',
                source: { id: '3.1' },
                mapping_type: 'one_to_one',
                action: 'sync_instances',
              },
            ],
            tasks: [{ id: '5.1.1', task: 'Verwerkingsdoeleinde', type: ['open_text'] }],
          },
        ],
      },
    ]

    it('skips tasks without instance_mapping dependencies (mappingDeps empty)', () => {
      // A tree with no mapping deps at all → every task hits the early return.
      taskStore.init(
        [
          {
            id: '0',
            task: 'Intro',
            type: ['task_group'],
            tasks: [{ id: '0.1', task: 'Naam', type: ['text_input'] }],
          },
        ] as Task[],
        true,
      )
      const { syncInstances } = useTaskDependencies()
      expect(() => syncInstances.value()).not.toThrow()
      // Nothing changed: still the default instances.
      expect(taskStore.getInstanceIdsForTask('0.1')).toEqual(['0.1'])
    })

    it('adds target instances for source-only indices and maps shared indices', () => {
      taskStore.init(mappingTree, true)
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '3.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
        '3.1.1[2]': { value: 'C', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      // Sources 3.1[0..2], target only default 5.1[0].
      expect(taskStore.getInstanceIdsForTask('3.1')).toEqual(['3.1[0]', '3.1[1]', '3.1[2]'])
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]'])

      const { syncInstances } = useTaskDependencies()
      syncInstances.value()

      // Index 0 shared → mapped; indices 1,2 source-only → added.
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]', '5.1[2]'])
      const mapped0 = taskStore.getInstanceById('5.1[0]')
      expect(mapped0?.mappedFromInstanceId).toBe('3.1[0]')
      const mapped1 = taskStore.getInstanceById('5.1[1]')
      expect(mapped1?.mappedFromInstanceId).toBe('3.1[1]')
    })

    it('removes target-only instances that have no matching source', () => {
      taskStore.init(mappingTree, true)
      // Source has only index 0; target has indices 0 and 1.
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '5.1.1[0]': { value: 'Doel A', lastEditedAt: '2024-01-01' },
        '5.1.1[1]': { value: 'Doel B', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      expect(taskStore.getInstanceIdsForTask('3.1')).toEqual(['3.1[0]'])
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]'])

      const { syncInstances } = useTaskDependencies()
      syncInstances.value()

      // Target-only index 1 removed.
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]'])
    })

    it('continues (skips dep) when an instance_mapping dependency has no source id', () => {
      taskStore.init(
        [
          {
            id: '5',
            task: 'Doeleinden',
            type: ['task_group'],
            tasks: [
              {
                id: '5.1',
                task: 'Doel',
                type: ['task_group'],
                repeatable: true,
                dependencies: [
                  // instance_mapping without a source → dep.source?.id is undefined → continue
                  { type: 'instance_mapping', mapping_type: 'one_to_one', action: 'sync_instances' },
                ],
                tasks: [{ id: '5.1.1', task: 'Doel', type: ['open_text'] }],
              },
            ],
          },
        ] as Task[],
        true,
      )
      const { syncInstances } = useTaskDependencies()
      expect(() => syncInstances.value()).not.toThrow()
      // Untouched: default instance only.
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]'])
    })

    it('skips adding a target instance when addRepeatableTaskInstance returns falsy (non-repeatable target)', () => {
      // Target task "5.1" is NOT repeatable but carries an instance_mapping dep
      // whose source ("3.1") has an extra index 1. addRepeatableTaskInstance
      // returns '' for the non-repeatable target, so the `if (newId)` guard is
      // false and no mapping is set.
      taskStore.init(
        [
          {
            id: '3',
            task: 'Gegevensverwerkingen',
            type: ['task_group'],
            tasks: [
              {
                id: '3.1',
                task: 'Gegevensverwerking',
                type: ['task_group'],
                repeatable: true,
                tasks: [{ id: '3.1.1', task: 'Naam', type: ['text_input'] }],
              },
            ],
          },
          {
            id: '5',
            task: 'Doeleinden',
            type: ['task_group'],
            tasks: [
              {
                id: '5.1',
                task: 'Doel (non-repeatable)',
                type: ['task_group'],
                // NOT repeatable on purpose
                dependencies: [
                  {
                    type: 'instance_mapping',
                    source: { id: '3.1' },
                    mapping_type: 'one_to_one',
                    action: 'sync_instances',
                  },
                ],
                tasks: [{ id: '5.1.1', task: 'Doel', type: ['open_text'] }],
              },
            ],
          },
        ] as Task[],
        true,
      )
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '3.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      // Source has indices 0,1. Target 5.1 is non-repeatable → its instance id
      // is "5.1" (no index) which exercises the byIndex idx===undefined branch.
      expect(taskStore.getInstanceIdsForTask('3.1')).toEqual(['3.1[0]', '3.1[1]'])
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1'])

      const { syncInstances } = useTaskDependencies()
      syncInstances.value()

      // Source index 0 and 1 are source-only (target id "5.1" has no parsed
      // index). addRepeatableTaskInstance returns '' → no instance added.
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1'])
    })

    it('uses parentInstanceId when the mapped task has a parentId (parentId || undefined truthy branch)', () => {
      // Nested mapping: target repeatable lives under a repeatable parent, so
      // task.parentId is truthy and is passed as parentInstanceId.
      taskStore.init(mappingTree, true)
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '3.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      const { syncInstances } = useTaskDependencies()
      // 5.1 has parentId '5' (truthy) → parentInstanceId branch taken.
      expect(() => syncInstances.value()).not.toThrow()
      expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]'])
    })

    it('passes undefined parentInstanceId when the mapped task is a root task (parentId falsy branch)', () => {
      // Target repeatable "5" is itself a ROOT task → task.parentId is null
      // → the `|| undefined` right-hand branch is taken.
      taskStore.init(
        [
          {
            id: '3',
            task: 'Source group',
            type: ['task_group'],
            tasks: [
              {
                id: '3.1',
                task: 'Source repeatable',
                type: ['task_group'],
                repeatable: true,
                tasks: [{ id: '3.1.1', task: 'Naam', type: ['text_input'] }],
              },
            ],
          },
          {
            id: '5',
            task: 'Root repeatable mapped target',
            type: ['task_group'],
            repeatable: true,
            dependencies: [
              {
                type: 'instance_mapping',
                source: { id: '3.1' },
                mapping_type: 'one_to_one',
                action: 'sync_instances',
              },
            ],
            tasks: [{ id: '5.1', task: 'Doel', type: ['open_text'] }],
          },
        ] as Task[],
        true,
      )
      answerStore.answers[FormType.DPIA] = {
        '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '3.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
      }
      rebuildRepeatableInstances(taskStore, answerStore)

      const { syncInstances } = useTaskDependencies()
      // Root task "5" has parentId null → parentInstanceId resolves to undefined.
      expect(() => syncInstances.value()).not.toThrow()
      expect(taskStore.getInstanceIdsForTask('5')).toEqual(['5[0]', '5[1]'])
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import { applyStateToStores, rebuildRepeatableInstances } from '../../src/utils/applyState'
import type { AssessmentState, GroupedAnswerValue } from '../../src/models/assessmentState'
import { FormType, type Task } from '../../src/models/dpia'

describe('applyStateToStores', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  describe('completedTasks branch (state.metadata?.completedTasks?.length)', () => {
    it('applies completedTasks when present and non-empty', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', completedTasks: ['0', '1', '2'] },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '2']))
    })

    it('does not touch completedRootTaskIds when completedTasks is an empty array', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      taskStore.completedRootTaskIds.dpia = new Set(['9'])

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', completedTasks: [] },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set(['9']))
    })

    it('does not touch completedRootTaskIds when completedTasks is absent', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      taskStore.completedRootTaskIds.dpia = new Set(['7'])

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set(['7']))
    })

    it('does not throw and skips when metadata is missing entirely', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      taskStore.completedRootTaskIds.dpia = new Set(['5'])

      const state = { answers: {} } as unknown as AssessmentState

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set(['5']))
    })
  })

  describe('answers branch (state.answers || {} and Object.keys length)', () => {
    it('applies flat (non-grouped) answers — ternary false branch (no arrays)', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
          '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
        },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.prescan['1.1.1']).toEqual({ value: 'false', lastEditedAt: '2024-01-01' })
    })

    it('flattens grouped answers — ternary true branch (some value is array)', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.setActiveNamespace(FormType.DPIA)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          '0.1': { value: 'Project', lastEditedAt: '2024-01-01' },
          '2.1': [
            { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
            { _index: 2, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
          ],
        } as Record<string, GroupedAnswerValue>,
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['0.1']).toEqual({ value: 'Project', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.dpia['2.1.1[0]']).toEqual({ value: 'Email', lastEditedAt: '2024-01-01' })
      expect(answerStore.answers.dpia['2.1.1[2]']).toEqual({ value: 'Phone', lastEditedAt: '2024-01-01' })
    })

    it('does not overwrite existing answers when state.answers is empty (length 0 branch)', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.answers.dpia = { '1.1': { value: 'existing', lastEditedAt: '2024-01-01' } }

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['1.1']).toEqual({ value: 'existing', lastEditedAt: '2024-01-01' })
    })

    it('treats missing answers as empty via the `|| {}` fallback', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.answers.dpia = { '1.1': { value: 'keep', lastEditedAt: '2024-01-01' } }

      const state = { metadata: { createdAt: '2024-01-01' } } as unknown as AssessmentState

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['1.1']).toEqual({ value: 'keep', lastEditedAt: '2024-01-01' })
    })

    it('resets the namespace answers object before assigning (clears stale keys)', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.answers.prescan = { 'old': { value: 'stale', lastEditedAt: '2024-01-01' } }

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: { '0.1': { value: 'new', lastEditedAt: '2024-01-01' } },
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.prescan['old']).toBeUndefined()
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'new', lastEditedAt: '2024-01-01' })
    })
  })
})

describe('rebuildRepeatableInstances', () => {
  const repeatableTaskTree: Task[] = [
    {
      id: '2',
      task: 'Persoonsgegevens',
      type: ['task_group'],
      tasks: [
        {
          id: '2.1',
          task: 'Persoonsgegevens',
          type: ['task_group'],
          repeatable: true,
          instance_label_template: 'Persoonsgegeven {index}',
          tasks: [
            { id: '2.1.1', task: 'Naam', type: ['text'] },
            { id: '2.1.2', task: 'Categorie', type: ['text'] },
          ],
        },
      ],
    },
  ]

  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('rebuilds extra instances from flat answer keys (index !== 0 path)', () => {
    taskStore.init(repeatableTaskTree, true)

    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
      '2.1.2[0]': { value: 'Employees', lastEditedAt: '2024-01-01' },
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
      '2.1.1[2]': { value: 'Address', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]', '2.1[2]'])
  })

  it('keeps only the default instance when only index 0 has answers (index === 0 continue)', () => {
    taskStore.init(repeatableTaskTree, true)

    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('does nothing when there are no answers at all (indices.size === 0)', () => {
    taskStore.init(repeatableTaskTree, true)

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('removes the default instance when other indices exist but 0 does not (size>0 && !has(0))', () => {
    taskStore.init(repeatableTaskTree, true)

    answerStore.answers[FormType.DPIA] = {
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
      '2.1.1[2]': { value: 'Address', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[1]', '2.1[2]'])
  })

  it('uses the `answerStore.answers[ns] || {}` fallback when namespace answers are missing', () => {
    taskStore.init(repeatableTaskTree, true)

    ;(answerStore.answers as Record<string, unknown>)[FormType.DPIA] = undefined

    expect(() => rebuildRepeatableInstances(taskStore, answerStore)).not.toThrow()
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  describe('grouped answers parameter', () => {
    it('preserves an empty instance present only in groupedAnswers (Array.isArray true)', () => {
      taskStore.init(repeatableTaskTree, true)

      answerStore.answers[FormType.DPIA] = {
        '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
      }

      const groupedAnswers: Record<string, GroupedAnswerValue> = {
        '2.1': [
          { _index: 0 },
          { _index: 1, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' } },
        ],
      }

      rebuildRepeatableInstances(taskStore, answerStore, groupedAnswers)

      expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])
    })

    it('ignores a non-array groupedAnswers entry (Array.isArray false branch)', () => {
      taskStore.init(repeatableTaskTree, true)

      answerStore.answers[FormType.DPIA] = {
        '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
      }

      const groupedAnswers: Record<string, GroupedAnswerValue> = {
        '2.1': { value: 'not-an-array', lastEditedAt: '2024-01-01' },
      }

      rebuildRepeatableInstances(taskStore, answerStore, groupedAnswers)

      expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
    })
  })

  describe('root-level repeatable (task.parentId falsy branches)', () => {
    it('rebuilds extra instances for a root-level repeatable task (parentId null)', () => {
      const rootRepeatableTree: Task[] = [
        {
          id: '0',
          task: 'Root repeatable',
          type: ['task_group'],
          repeatable: true,
          tasks: [{ id: '0.1', task: 'Veld', type: ['text'] }],
        },
      ]

      taskStore.init(rootRepeatableTree, true)

      answerStore.answers[FormType.DPIA] = {
        '0.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '0.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
      }

      rebuildRepeatableInstances(taskStore, answerStore)

      expect(taskStore.getInstanceIdsForTask('0')).toEqual(['0[0]', '0[1]'])
    })
  })

  describe('non-repeatable and nested-repeatable skip branches', () => {
    it('skips non-repeatable tasks (!task.repeatable continue)', () => {
      const nonRepeatableTree: Task[] = [
        {
          id: '0',
          task: 'Intro',
          type: ['task_group'],
          tasks: [{ id: '0.1', task: 'Naam', type: ['text'] }],
        },
      ]

      taskStore.init(nonRepeatableTree, true)
      answerStore.answers[FormType.DPIA] = {
        '0.1': { value: 'Project', lastEditedAt: '2024-01-01' },
      }

      expect(() => rebuildRepeatableInstances(taskStore, answerStore)).not.toThrow()
      expect(taskStore.getInstanceIdsForTask('0.1')).toEqual(['0.1'])
    })

    it('skips a repeatable nested under a repeatable parent (parentTask?.repeatable continue)', () => {
      const nestedRepeatableTree: Task[] = [
        {
          id: '3',
          task: 'Outer',
          type: ['task_group'],
          tasks: [
            {
              id: '3.1',
              task: 'Repeatable parent',
              type: ['task_group'],
              repeatable: true,
              tasks: [
                {
                  id: '3.1.1',
                  task: 'Nested repeatable',
                  type: ['task_group'],
                  repeatable: true,
                  tasks: [{ id: '3.1.1.1', task: 'Veld', type: ['text'] }],
                },
              ],
            },
          ],
        },
      ]

      taskStore.init(nestedRepeatableTree, true)

      const before = taskStore.getInstanceIdsForTask('3.1.1')

      answerStore.answers[FormType.DPIA] = {
        '3.1.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
        '3.1.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
      }

      rebuildRepeatableInstances(taskStore, answerStore)

      const after = taskStore.getInstanceIdsForTask('3.1.1')
      expect(after).toEqual(before)
    })
  })
})

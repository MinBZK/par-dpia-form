import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { applyStateToStores, rebuildRepeatableInstances } from '../src/utils/applyState'
import type { AssessmentState } from '../src/models/assessmentState'
import { FormType, type Task } from '../src/models/dpia'

describe('applyStateToStores', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  describe('answers', () => {
    it('applies answers to active namespace', () => {
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

    it('does not overwrite answers when state has empty answers', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.answers.dpia = { '1.1': { value: 'existing', lastEditedAt: '2024-01-01' } }

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['1.1']).toEqual({ value: 'existing', lastEditedAt: '2024-01-01' })
    })
  })

  describe('completedTasks', () => {
    it('applies completedTasks from metadata', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01', completedTasks: ['0', '1', '3', '5', '7'] },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3', '5', '7']))
    })

    it('does not clear completedRootTaskIds when state has empty completedTasks', () => {
      taskStore.setActiveNamespace(FormType.DPIA)
      taskStore.completedRootTaskIds.dpia = new Set(['0', '1'])

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {},
      }

      applyStateToStores(state, taskStore, answerStore)

      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set(['0', '1']))
    })
  })

  describe('full import pipeline: AssessmentOutput → normalize → apply', () => {
    it('prescan export with explicit completedTasks applies correctly', async () => {
      const { detectImportType, normalizeToState } = await import('../src/utils/importDetect')

      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)

      const exportedJson = {
        $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
        metadata: {
          urn: 'urn:nl:prescan:2.0',
          createdAt: '2026-03-19T22:05:10.062Z',
          completedTasks: ['0', '1', '3', '5'],
        },
        answers: {
          '0.1': { value: 'true', timestamp: '2026-03-19T22:02:49.853Z' },
          '0.2': { value: 'beschrijving', timestamp: '2026-02-10T21:59:09.431Z' },
          '1.1.1': { value: 'true', timestamp: '2026-02-10T22:01:42.541Z' },
          '3.1': { value: [], timestamp: '2026-02-10T22:04:42.338Z' },
          '5.1.1': { value: 'false', timestamp: '2026-02-10T22:05:06.564Z' },
        },
      }

      const type = detectImportType(exportedJson)
      const state = normalizeToState(exportedJson, type!)
      applyStateToStores(state, taskStore, answerStore)

      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', timestamp: '2026-03-19T22:02:49.853Z' })
      expect(taskStore.completedRootTaskIds.prescan).toEqual(new Set(['0', '1', '3', '5']))
    })

    it('DPIA export without completedTasks does not mark sections as completed', async () => {
      const { normalizeToState } = await import('../src/utils/importDetect')

      taskStore.setActiveNamespace(FormType.DPIA)
      answerStore.setActiveNamespace(FormType.DPIA)

      const exportedJson = {
        $schema: 'https://github.com/MinBZK/par-dpia-form/blob/main/schemas/assessment-output.v2.schema.json',
        metadata: { urn: 'urn:nl:dpia:3.0', createdAt: '2026-03-22T09:41:24.439Z' },
        answers: { '1.1': { value: 'Een beschrijving', lastEditedAt: '2026-03-22T09:41:17.050Z' } },
      }

      const state = normalizeToState(exportedJson, 'dpia')
      applyStateToStores(state, taskStore, answerStore)

      expect(answerStore.answers.dpia['1.1']).toBeDefined()
      expect(taskStore.completedRootTaskIds.dpia).toEqual(new Set())
    })
  })

  describe('setAnswer after import preserves existing answers', () => {
    it('changing one answer does not clear other answers in the same namespace', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
          '0.2': { value: 'beschrijving', lastEditedAt: '2024-01-01' },
          '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
          '1.2.1': { value: 'true', lastEditedAt: '2024-01-01' },
          '3.1': { value: [], lastEditedAt: '2024-01-01' },
        },
      }

      applyStateToStores(state, taskStore, answerStore)
      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)

      answerStore.setAnswer('1.1.1', 'true')

      expect(Object.keys(answerStore.answers.prescan)).toHaveLength(5)
      expect(answerStore.answers.prescan['0.1']).toEqual({ value: 'true', lastEditedAt: '2024-01-01' })
    })

    it('JSON.stringify of answers after setAnswer includes all answers', () => {
      taskStore.setActiveNamespace(FormType.PRE_SCAN)
      answerStore.setActiveNamespace(FormType.PRE_SCAN)

      const state: AssessmentState = {
        metadata: { createdAt: '2024-01-01' },
        answers: {
          '0.1': { value: 'true', lastEditedAt: '2024-01-01' },
          '0.2': { value: 'beschrijving', lastEditedAt: '2024-01-01' },
          '1.1.1': { value: 'false', lastEditedAt: '2024-01-01' },
        },
      }

      applyStateToStores(state, taskStore, answerStore)
      answerStore.setAnswer('1.1.1', 'true')

      const builtState = {
        answers: { prescan: answerStore.answers.prescan },
      }
      const serialized = JSON.parse(JSON.stringify(builtState))

      expect(Object.keys(serialized.answers.prescan)).toHaveLength(3)
      expect(serialized.answers.prescan['0.1'].value).toBe('true')
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

  it('rebuilds extra instances from answer keys', () => {
    taskStore.init(repeatableTaskTree, true)

    // Simulate answers with 3 instances (indices 0, 1, 2)
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
      '2.1.2[0]': { value: 'Employees', lastEditedAt: '2024-01-01' },
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
      '2.1.2[1]': { value: 'Customers', lastEditedAt: '2024-01-01' },
      '2.1.1[2]': { value: 'Address', lastEditedAt: '2024-01-01' },
      '2.1.2[2]': { value: 'Suppliers', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    // Should have 3 instances of 2.1
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]', '2.1[2]'])
    // Each with correct children
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')).toEqual(['2.1.1[0]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[1]')).toEqual(['2.1.1[1]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[2]')).toEqual(['2.1.1[2]'])
  })

  it('handles index gaps (deleted instances)', () => {
    taskStore.init(repeatableTaskTree, true)

    // Answers with gap: index 0 and 2 (1 was deleted)
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
      '2.1.1[2]': { value: 'Phone', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[2]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')).toEqual(['2.1.1[0]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[2]')).toEqual(['2.1.1[2]'])
  })

  it('does nothing when only default instance exists', () => {
    taskStore.init(repeatableTaskTree, true)

    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
    }

    rebuildRepeatableInstances(taskStore, answerStore)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('does nothing when there are no answers', () => {
    taskStore.init(repeatableTaskTree, true)

    rebuildRepeatableInstances(taskStore, answerStore)

    // Default instance still exists
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]'])
  })

  it('preserves empty instances from grouped answers', () => {
    taskStore.init(repeatableTaskTree, true)

    // Only index 1 has answers in the store
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[1]': { value: 'Phone', lastEditedAt: '2024-01-01' },
      '2.1.2[1]': { value: 'Customers', lastEditedAt: '2024-01-01' },
    }

    // But the grouped answers include an empty index 0
    const groupedAnswers = {
      '2.1': [
        { _index: 0 },
        { _index: 1, '2.1.1': { value: 'Phone', lastEditedAt: '2024-01-01' }, '2.1.2': { value: 'Customers', lastEditedAt: '2024-01-01' } },
      ],
    }

    rebuildRepeatableInstances(taskStore, answerStore, groupedAnswers)

    // Both instances should exist
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]'])
  })

  it('preserves empty instance at index > 0 from grouped answers', () => {
    taskStore.init(repeatableTaskTree, true)

    // Only index 0 has answers
    answerStore.answers[FormType.DPIA] = {
      '2.1.1[0]': { value: 'Email', lastEditedAt: '2024-01-01' },
    }

    // But grouped answers show indices 0 and 2 (1 was deleted, 2 is empty)
    const groupedAnswers = {
      '2.1': [
        { _index: 0, '2.1.1': { value: 'Email', lastEditedAt: '2024-01-01' } },
        { _index: 2 },
      ],
    }

    rebuildRepeatableInstances(taskStore, answerStore, groupedAnswers)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[2]'])
  })
})

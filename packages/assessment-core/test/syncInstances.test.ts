import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useTaskDependencies } from '../src/composables/useTaskDependencies'
import { rebuildRepeatableInstances } from '../src/utils/applyState'
import { FormType, type Task } from '../src/models/dpia'

/**
 * Scenario: task "5.1" is repeatable with an instance_mapping dependency
 * on "3.1.1" (action: sync_instances, one_to_one). Each "3.1" instance
 * should correspond to exactly one "5.1" instance sharing the same index.
 */
const tree: Task[] = [
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
        tasks: [
          { id: '3.1.1', task: 'Naam', type: ['text_input'] },
        ],
      },
    ],
  },
  {
    id: '5',
    task: 'Verwerkingsdoeleinden',
    type: ['task_group'],
    tasks: [
      {
        id: '5.1',
        task: 'Gegevensverwerking & verwerkingsdoeleinde',
        type: ['task_group'],
        repeatable: true,
        dependencies: [
          {
            type: 'instance_mapping',
            source: { id: '3.1.1' },
            mapping_type: 'one_to_one',
            action: 'sync_instances',
          },
        ],
        tasks: [
          { id: '5.1.1', task: 'Verwerkingsdoeleinde', type: ['open_text'] },
        ],
      },
    ],
  },
]

describe('syncInstances with instance_mapping', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('does not duplicate target instances when reloading a persisted state', () => {
    // First load: init creates default instances for 3.1[0] and 5.1[0]
    taskStore.init(tree, true)

    // Simulate user has 3 source instances (3.1) with text answers,
    // and 3 target instances (5.1) with answers matched by index.
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[0]': { value: 'Verwerking A', lastEditedAt: '2024-01-01' },
      '3.1.1[1]': { value: 'Verwerking B', lastEditedAt: '2024-01-01' },
      '3.1.1[2]': { value: 'Verwerking C', lastEditedAt: '2024-01-01' },
      '5.1.1[0]': { value: 'Doel A', lastEditedAt: '2024-01-01' },
      '5.1.1[1]': { value: 'Doel B', lastEditedAt: '2024-01-01' },
      '5.1.1[2]': { value: 'Doel C', lastEditedAt: '2024-01-01' },
    }

    // Rebuild instances from answer keys (emulates load-from-storage path)
    rebuildRepeatableInstances(taskStore, answerStore)

    // Sanity check: 3 source + 3 target instances before sync
    expect(taskStore.getInstanceIdsForTask('3.1')).toEqual(['3.1[0]', '3.1[1]', '3.1[2]'])
    expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]', '5.1[2]'])

    // Run syncInstances — should be a no-op for the mapping
    const { syncInstances } = useTaskDependencies()
    syncInstances.value()

    // Expectation: target count equals source count, one per index
    expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]', '5.1[2]'])

    // Running sync multiple times must remain stable (no growth)
    syncInstances.value()
    syncInstances.value()
    expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]', '5.1[2]'])
  })

  it('keeps target answers aligned to source indices after sync', () => {
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[0]': { value: 'Verwerking A', lastEditedAt: '2024-01-01' },
      '3.1.1[1]': { value: 'Verwerking B', lastEditedAt: '2024-01-01' },
      '3.1.1[2]': { value: 'Verwerking C', lastEditedAt: '2024-01-01' },
      '5.1.1[0]': { value: 'Doel A', lastEditedAt: '2024-01-01' },
      '5.1.1[1]': { value: 'Doel B', lastEditedAt: '2024-01-01' },
      '5.1.1[2]': { value: 'Doel C', lastEditedAt: '2024-01-01' },
    }
    rebuildRepeatableInstances(taskStore, answerStore)

    const { syncInstances } = useTaskDependencies()
    syncInstances.value()

    // Answers must still be retrievable at the same indices
    expect(answerStore.answers.dpia['5.1.1[0]']?.value).toBe('Doel A')
    expect(answerStore.answers.dpia['5.1.1[1]']?.value).toBe('Doel B')
    expect(answerStore.answers.dpia['5.1.1[2]']?.value).toBe('Doel C')
  })

  it('adds missing target instances for new source instances', () => {
    taskStore.init(tree, true)
    // Two sources exist, no targets beyond default
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[0]': { value: 'A', lastEditedAt: '2024-01-01' },
      '3.1.1[1]': { value: 'B', lastEditedAt: '2024-01-01' },
    }
    rebuildRepeatableInstances(taskStore, answerStore)

    const { syncInstances } = useTaskDependencies()
    syncInstances.value()

    expect(taskStore.getInstanceIdsForTask('5.1')).toEqual(['5.1[0]', '5.1[1]'])
  })
})

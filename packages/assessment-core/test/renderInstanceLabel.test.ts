import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useTaskDependencies } from '../src/composables/useTaskDependencies'
import { rebuildRepeatableInstances } from '../src/utils/applyState'
import { renderInstanceLabel } from '../src/utils/taskUtils'
import { FormType, type Task } from '../src/models/dpia'

// 3.1 (source, free-text 3.1.1) maps one-to-one to 5.1, whose label derives from the 3.1.1 answer.
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
        tasks: [{ id: '3.1.1', task: 'Naam', type: ['text_input'] }],
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
        task: 'Gegevensverwerking',
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
        tasks: [{ id: '5.1.1', task: 'Doel', type: ['open_text'] }],
      },
    ],
  },
]

describe('renderInstanceLabel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('HTML-escapes the user answer substituted into an instance label', () => {
    const taskStore = useTaskStore()
    const answerStore = useAnswerStore()
    taskStore.init(tree, true)
    answerStore.answers[FormType.DPIA] = {
      '3.1.1[0]': { value: '<img src=x onerror=alert(1)>', lastEditedAt: '2024-01-01' },
    }
    rebuildRepeatableInstances(taskStore, answerStore)
    useTaskDependencies().syncInstances.value()

    const label = renderInstanceLabel('5.1[0]', 'Verwerking {3.1.1}')

    expect(label).toContain('Verwerking ')
    expect(label).not.toContain('<img')
    expect(label).toContain('&lt;img')
  })
})

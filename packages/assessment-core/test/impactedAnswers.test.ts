import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import {
  findImpactedByDelete,
  findImpactedByConditionalChange,
  filterVisibleAnswers,
  summariseImpact,
} from '../src/utils/impactedAnswers'
import { FormType, type Task } from '../src/models/dpia'

/**
 * Mini task tree with:
 * - 3.1 (repeatable) → 3.1.1
 * - 5.1 (repeatable, sync_instances ← 3.1.1) → 5.1.1 (open_text)
 * - 2.1.6 (radio boolean) gates 2.1.7 via conditional
 */
const tree: Task[] = [
  {
    id: '2',
    task: 'Persoonsgegevens',
    type: ['task_group'],
    tasks: [
      {
        id: '2.1',
        task: 'Persoonsgegeven',
        type: ['task_group'],
        repeatable: true,
        tasks: [
          { id: '2.1.6', task: 'Afgeleide data?', type: ['radio_option'], valueType: 'boolean' },
          {
            id: '2.1.7',
            task: 'Bron',
            type: ['text_input'],
            dependencies: [
              { type: 'conditional', condition: { id: '2.1.6', operator: 'equals', value: true }, action: 'show' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: '3',
    task: 'Gegevensverwerking',
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
        task: 'Doel',
        type: ['task_group'],
        repeatable: true,
        dependencies: [
          { type: 'instance_mapping', source: { id: '3.1.1' }, mapping_type: 'one_to_one', action: 'sync_instances' },
        ],
        tasks: [{ id: '5.1.1', task: 'Doel tekst', type: ['open_text'] }],
      },
    ],
  },
]

describe('findImpactedByDelete', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(tree, true)
  })

  it('reports answers on the deleted instance itself', () => {
    taskStore.addRepeatableTaskInstance('3.1', '3', 1)
    answerStore.answers.dpia['3.1.1[1]'] = { value: 'Verwerking B', lastEditedAt: '' }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toContain('3.1.1[1]')
  })

  it('cascades through sync_instances targets with the same index', () => {
    taskStore.addRepeatableTaskInstance('3.1', '3', 1)
    taskStore.addRepeatableTaskInstance('5.1', '5', 1)
    answerStore.answers.dpia['3.1.1[1]'] = { value: 'Verwerking B', lastEditedAt: '' }
    answerStore.answers.dpia['5.1.1[1]'] = { value: 'Doel B', lastEditedAt: '' }

    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId).sort()).toEqual(['3.1.1[1]', '5.1.1[1]'])
  })

  it('skips descendants without values', () => {
    taskStore.addRepeatableTaskInstance('3.1', '3', 1)
    const impacted = findImpactedByDelete('3.1[1]', taskStore, answerStore)
    expect(impacted).toHaveLength(0)
  })
})

describe('findImpactedByConditionalChange', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(tree, true)
  })

  it('reports dependent answers that would become hidden when toggling off', () => {
    answerStore.answers.dpia['2.1.6[0]'] = { value: 'true', lastEditedAt: '' }
    answerStore.answers.dpia['2.1.7[0]'] = { value: 'Externe partner', lastEditedAt: '' }

    const impacted = findImpactedByConditionalChange('2.1.6[0]', 'false', taskStore, answerStore)
    expect(impacted.map((i) => i.instanceId)).toEqual(['2.1.7[0]'])
    expect(impacted[0].value).toBe('Externe partner')
  })

  it('does not report dependents that have no value', () => {
    answerStore.answers.dpia['2.1.6[0]'] = { value: 'true', lastEditedAt: '' }
    const impacted = findImpactedByConditionalChange('2.1.6[0]', 'false', taskStore, answerStore)
    expect(impacted).toHaveLength(0)
  })

  it('returns empty when the value does not actually change', () => {
    answerStore.answers.dpia['2.1.6[0]'] = { value: 'true', lastEditedAt: '' }
    answerStore.answers.dpia['2.1.7[0]'] = { value: 'Externe partner', lastEditedAt: '' }

    const impacted = findImpactedByConditionalChange('2.1.6[0]', 'true', taskStore, answerStore)
    expect(impacted).toHaveLength(0)
  })
})

describe('filterVisibleAnswers', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(tree, true)
  })

  it('drops answers on hidden conditional fields', () => {
    answerStore.answers.dpia['2.1.6[0]'] = { value: 'false', lastEditedAt: '' }
    answerStore.answers.dpia['2.1.7[0]'] = { value: 'silently stored', lastEditedAt: '' }

    const filtered = filterVisibleAnswers(answerStore.answers.dpia, taskStore, answerStore)
    expect(filtered['2.1.6[0]']).toBeDefined()
    expect(filtered['2.1.7[0]']).toBeUndefined()
  })

  it('keeps answers that are visible', () => {
    answerStore.answers.dpia['2.1.6[0]'] = { value: 'true', lastEditedAt: '' }
    answerStore.answers.dpia['2.1.7[0]'] = { value: 'keep', lastEditedAt: '' }

    const filtered = filterVisibleAnswers(answerStore.answers.dpia, taskStore, answerStore)
    expect(filtered['2.1.7[0]']).toBeDefined()
  })
})

describe('summariseImpact', () => {
  let taskStore: ReturnType<typeof useTaskStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(tree, true)
  })

  it('groups items by root section', () => {
    const summary = summariseImpact(
      [
        { instanceId: '3.1.1[1]', taskId: '3.1.1', value: 'A', reason: 'sync_cascade' },
        { instanceId: '5.1.1[1]', taskId: '5.1.1', value: 'B', reason: 'sync_cascade' },
      ],
      taskStore,
    )
    expect(summary.total).toBe(2)
    expect(summary.bySection.map((s) => s.sectionId)).toEqual(['3', '5'])
  })
})

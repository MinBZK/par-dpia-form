import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import {
  createConclusionTask,
  removeTemplatePattern,
  renderInstanceLabel,
} from '../../src/utils/taskUtils'
import { FormType, type Task } from '../../src/models/dpia'

describe('createConclusionTask', () => {
  it('builds a task_group + signing task with the given name and id', () => {
    const task = createConclusionTask('Ondertekening', 'sign-1')

    expect(task.task).toBe('Ondertekening')
    expect(task.id).toBe('sign-1')
    expect(task.type).toEqual(['task_group', 'signing'])
    expect(task.repeatable).toBe(false)
    expect(task.tasks).toEqual([])
    // Default param: description omitted → undefined
    expect(task.description).toBeUndefined()
  })

  it('passes through an explicit description', () => {
    const task = createConclusionTask('Conclusie', 'sign-2', 'Een beschrijving')

    expect(task.description).toBe('Een beschrijving')
    expect(task.id).toBe('sign-2')
  })
})

describe('removeTemplatePattern', () => {
  it('strips a {placeholder} segment and trims whitespace', () => {
    expect(removeTemplatePattern('Persoonsgegeven {index}')).toBe('Persoonsgegeven')
  })

  it('removes multiple brace segments along with their leading whitespace', () => {
    expect(removeTemplatePattern('A {x} B {y}')).toBe('A B')
  })

  it('returns the trimmed input unchanged when there are no braces', () => {
    expect(removeTemplatePattern('  Geen placeholder  ')).toBe('Geen placeholder')
  })
})

describe('renderInstanceLabel', () => {
  // Tree where 2.1 is repeatable with a label template referencing child 2.1.1
  const taskTree: Task[] = [
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
          instance_label_template: 'Persoonsgegeven: {2.1.1}',
          tasks: [{ id: '2.1.1', task: 'Naam', type: ['text_input'] }],
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
    taskStore.init(taskTree, true)
  })

  it('returns the template unchanged when the instance does not exist', () => {
    const result = renderInstanceLabel('does-not-exist', 'Persoonsgegeven: {2.1.1}')
    expect(result).toBe('Persoonsgegeven: {2.1.1}')
  })

  it('keeps the raw {placeholder} when the instance has no mapping source', () => {
    // Default instance 2.1[0] exists but has no mappedFromInstanceId
    const result = renderInstanceLabel('2.1[0]', 'Persoonsgegeven: {2.1.1}')
    expect(result).toBe('Persoonsgegeven: {2.1.1}')
  })

  it('renders an empty string for the placeholder when the mapped answer is null', () => {
    // Map the instance to a source instance that has no answer → getAnswer returns null
    taskStore.setInstanceMappingSource('2.1[0]', '2.1.1[0]')

    const result = renderInstanceLabel('2.1[0]', 'Persoonsgegeven: {2.1.1}')
    expect(result).toBe('Persoonsgegeven: ')
  })

  it('substitutes the mapped answer value into the template', () => {
    answerStore.answers[FormType.DPIA]['2.1.1[0]'] = {
      value: 'E-mailadres',
      lastEditedAt: '2026-01-01T00:00:00Z',
    }
    taskStore.setInstanceMappingSource('2.1[0]', '2.1.1[0]')

    const result = renderInstanceLabel('2.1[0]', 'Persoonsgegeven: {2.1.1}')
    expect(result).toBe('Persoonsgegeven: E-mailadres')
  })
})

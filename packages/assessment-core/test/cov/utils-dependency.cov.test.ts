import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../../src/stores/tasks'
import { useAnswerStore } from '../../src/stores/answers'
import {
  normalizeValue,
  hasInstanceMapping,
  shouldShowTask,
} from '../../src/utils/dependency'
import type { FlatTask } from '../../src/stores/tasks'
import type { Task, Dependency } from '../../src/models/dpia'

describe('normalizeValue', () => {
  it('parses "true" (case-insensitive) to boolean true', () => {
    expect(normalizeValue('true')).toBe(true)
    expect(normalizeValue('TRUE')).toBe(true)
    expect(normalizeValue('True')).toBe(true)
  })

  it('parses "false" (case-insensitive) to boolean false', () => {
    expect(normalizeValue('false')).toBe(false)
    expect(normalizeValue('FALSE')).toBe(false)
  })

  it('parses the literal "null" to null', () => {
    expect(normalizeValue('null')).toBeNull()
  })

  it('parses the empty string to null', () => {
    expect(normalizeValue('')).toBeNull()
  })

  it('returns the original string when no special value matches', () => {
    expect(normalizeValue('hello')).toBe('hello')
  })
})

describe('hasInstanceMapping', () => {
  function flatTask(dependencies?: Dependency[]): FlatTask {
    return {
      id: '2.1',
      task: 'Persoonsgegevens',
      type: ['text'],
      parentId: null,
      childrenIds: [],
      dependencies,
    }
  }

  it('returns true when a dependency of type instance_mapping exists', () => {
    const task = flatTask([{ type: 'instance_mapping', action: 'show' }])
    expect(hasInstanceMapping(task)).toBe(true)
  })

  it('returns false when dependencies exist but none are instance_mapping', () => {
    const task = flatTask([{ type: 'conditional', action: 'show' }])
    expect(hasInstanceMapping(task)).toBe(false)
  })

  it('returns false (via || fallback) when dependencies is undefined', () => {
    const task = flatTask(undefined)
    expect(hasInstanceMapping(task)).toBe(false)
  })
})

describe('shouldShowTask', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
  })

  // Children "1.1" and "1.2" share a default groupId, so findRelatedInstance("1.2", "1.1") resolves.
  function buildTasks(dependencies?: Dependency[]): Task[] {
    return [
      {
        task: 'Group',
        id: '1',
        type: ['task_group'],
        tasks: [
          { task: 'Field A', id: '1.1', type: ['text'], dependencies },
          { task: 'Field B', id: '1.2', type: ['text'] },
        ],
      },
    ] as unknown as Task[]
  }

  function initWith(dependencies?: Dependency[]): void {
    taskStore.init(buildTasks(dependencies))
  }

  it('shows the task when it has no dependencies array', () => {
    initWith(undefined)
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('shows the task when its dependencies array is empty', () => {
    initWith([])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('shows the task when the instance does not exist', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'yes' } }])
    expect(shouldShowTask('1.1', 'nonexistent-instance', taskStore, answerStore)).toBe(true)
  })

  it('shows the task when a dependency type is not conditional', () => {
    initWith([{ type: 'instance_mapping', action: 'show' }])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('shows the task when a conditional dependency has no condition', () => {
    initWith([{ type: 'conditional', action: 'show' }])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('throws when the condition value is null', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: null } }])
    expect(() => shouldShowTask('1.1', '1.1', taskStore, answerStore)).toThrow(
      'Dependency on task 1.2 with operator equals cannot have void value',
    )
  })

  it('throws when the condition value is undefined', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals' } } as unknown as Dependency])
    expect(() => shouldShowTask('1.1', '1.1', taskStore, answerStore)).toThrow(
      'Dependency on task 1.2 with operator equals cannot have void value',
    )
  })

  it('continues (no related instance) when the condition task is not in the same group', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: 'unknown-task', operator: 'equals', value: 'yes' } }])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('hides the task when operator equals and the answer does not match', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'yes' } }])
    answerStore.setAnswer('1.2', 'no')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(false)
  })

  it('shows the task when operator equals and the normalized string answer matches', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: true } }])
    answerStore.setAnswer('1.2', 'true')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('does not normalize non-string answers (array) and treats them with equals', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'a' } }])
    answerStore.setAnswer('1.2', ['a', 'b'])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(false)
  })

  it('always shows the task when operator is "any"', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'any', value: 'whatever' } }])
    answerStore.setAnswer('1.2', 'something-else')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('hides the task when operator is "contains" and the array answer does not include the value', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'contains', value: 'x' } }])
    answerStore.setAnswer('1.2', ['a', 'b'])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(false)
  })

  it('shows the task when operator is "contains" and the array answer includes the value', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'contains', value: 'b' } }])
    answerStore.setAnswer('1.2', ['a', 'b'])
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('treats "contains" with a non-array answer as an equality check (matching)', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'contains', value: 'hello' } }])
    answerStore.setAnswer('1.2', 'hello')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('treats "contains" with a non-array answer as an equality check (not matching)', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'contains', value: 'hello' } }])
    answerStore.setAnswer('1.2', 'world')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(false)
  })

  it('throws on an unsupported operator', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'greaterThan', value: '5' } }])
    answerStore.setAnswer('1.2', '6')
    expect(() => shouldShowTask('1.1', '1.1', taskStore, answerStore)).toThrow(
      'got an unsuported operator greaterThan',
    )
  })

  it('shows the task when the action is not "show" even if the condition is not met', () => {
    initWith([{ type: 'conditional', action: 'hide', condition: { id: '1.2', operator: 'equals', value: 'yes' } }])
    answerStore.setAnswer('1.2', 'no')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })

  it('shows the task when the action is "show" and the condition is met', () => {
    initWith([{ type: 'conditional', action: 'show', condition: { id: '1.2', operator: 'equals', value: 'yes' } }])
    answerStore.setAnswer('1.2', 'yes')
    expect(shouldShowTask('1.1', '1.1', taskStore, answerStore)).toBe(true)
  })
})

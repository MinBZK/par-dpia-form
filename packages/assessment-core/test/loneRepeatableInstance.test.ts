import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { groupAnswers } from '../src/utils/groupedAnswers'
import { applyStateToStores, rebuildRepeatableInstances } from '../src/utils/applyState'
import { useTaskStore, type FlatTask, type TaskInstance } from '../src/stores/tasks'
import { useAnswerStore, type Answer } from '../src/stores/answers'
import { FormType, type Task } from '../src/models/dpia'
import type { GroupedAnswerValue } from '../src/models/assessmentState'

function answer(value: string): Answer {
  return { value, lastEditedAt: '2026-01-01T00:00:00Z' }
}

// 2.1 repeatable, with a repeatable 2.1.2 nested under it.
const flatTasks: Record<string, FlatTask> = {
  '2': { id: '2', task: 'Section', type: ['task_group'], parentId: null, childrenIds: ['2.1'] },
  '2.1': {
    id: '2.1', task: 'Data', type: ['task_group'],
    parentId: '2', childrenIds: ['2.1.1', '2.1.2'], repeatable: true,
  },
  '2.1.1': { id: '2.1.1', task: 'Field A', type: ['text'], parentId: '2.1', childrenIds: [] },
  '2.1.2': {
    id: '2.1.2', task: 'Nested group', type: ['task_group'],
    parentId: '2.1', childrenIds: ['2.1.2.1'], repeatable: true,
  },
  '2.1.2.1': { id: '2.1.2.1', task: 'Field B', type: ['text'], parentId: '2.1.2', childrenIds: [] },
}

function instances(taskId: string, indices: number[]): Record<string, TaskInstance> {
  const out: Record<string, TaskInstance> = {}
  for (const i of indices) {
    out[`${taskId}[${i}]`] = { id: `${taskId}[${i}]`, taskId, parentId: null } as TaskInstance
  }
  return out
}

describe('a repeatable group whose only instance is not the default', () => {
  it('is saved, so it does not come back as instance 1 on the next load', () => {
    // The user added a second group, filled neither, and deleted the first.
    const grouped = groupAnswers({}, flatTasks, instances('2.1', [1]))
    expect(grouped['2.1']).toEqual([{ _index: 1 }])
  })

  it('is saved when it holds answers too', () => {
    const grouped = groupAnswers({ '2.1.1[1]': answer('A1') }, flatTasks, instances('2.1', [1]))
    expect(grouped['2.1']).toEqual([{ _index: 1, '2.1.1': answer('A1') }])
  })

  it('stays out of the file when it is the untouched default instance', () => {
    // init() recreates instance 0 for every repeatable, so writing it would add
    // an empty group to every assessment for nothing.
    expect(groupAnswers({}, flatTasks, instances('2.1', [0]))).toEqual({})
  })
})

describe('a repeatable nested under a repeatable', () => {
  it('carries the index of the instance it belongs to', () => {
    const grouped = groupAnswers(
      {
        '2.1.1[0]': answer('A0'),
        '2.1.2.1[0]': answer('B0'),
        '2.1.1[2]': answer('A2'),
        '2.1.2.1[2]': answer('B2'),
      },
      flatTasks,
      { ...instances('2.1', [0, 2]), ...instances('2.1.2', [0, 2]) },
    )

    expect(grouped['2.1']).toEqual([
      { _index: 0, '2.1.1': answer('A0') },
      { _index: 2, '2.1.1': answer('A2') },
    ])
    // The nested group is a key of its own, not an element inside its parent:
    // it shares the parent's index, so the two stay aligned.
    expect(grouped['2.1.2']).toEqual([
      { _index: 0, '2.1.2.1': answer('B0') },
      { _index: 2, '2.1.2.1': answer('B2') },
    ])
  })
})

describe('save and load a repeatable group whose first instance was deleted', () => {
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
          tasks: [{ id: '2.1.1', task: 'Naam', type: ['text'] }],
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

  it('hands the empty group back at its own index instead of at 0', () => {
    taskStore.init(taskTree, true)
    taskStore.addRepeatableTaskInstance('2.1', undefined, 1)
    taskStore.removeRepeatableTaskInstance('2.1[0]')
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[1]'])

    const answers = groupAnswers(
      answerStore.answers[FormType.DPIA],
      taskStore.flatTasks[FormType.DPIA],
      taskStore.taskInstances[FormType.DPIA],
    )

    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(taskTree, true)

    const state = { metadata: { createdAt: '2026-01-01T00:00:00Z' }, answers }
    applyStateToStores(state, taskStore, answerStore)
    rebuildRepeatableInstances(taskStore, answerStore, answers as Record<string, GroupedAnswerValue>)

    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[1]'])
  })
})

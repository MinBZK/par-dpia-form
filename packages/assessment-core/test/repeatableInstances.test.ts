import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, buildInstanceId, parseInstanceId } from '../src/stores/tasks'
import { FormType, type Task } from '../src/models/dpia'

/**
 * Minimal task tree that mirrors the DPIA structure for persoonsgegevens:
 *   2 (section, task_group)
 *     2.1 (repeatable task_group)
 *       2.1.1 (text field)
 *       2.1.2 (text field)
 */
const repeatableTaskTree: Task[] = [
  {
    id: '2',
    task: 'Persoonsgegevens en betrokkenen',
    type: ['task_group'],
    tasks: [
      {
        id: '2.1',
        task: 'Persoonsgegevens',
        type: ['task_group'],
        repeatable: true,
        instance_label_template: 'Persoonsgegeven {index}',
        tasks: [
          { id: '2.1.1', task: 'Naam persoonsgegeven', type: ['text'] },
          { id: '2.1.2', task: 'Categorie', type: ['text'] },
        ],
      },
    ],
  },
]

describe('repeatable task instances', () => {
  let taskStore: ReturnType<typeof useTaskStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    taskStore.init(repeatableTaskTree, true)
  })

  it('creates indexed instance IDs for children of repeatable parents', () => {
    // After init, 2.1[0] should exist with children 2.1.1[0] and 2.1.2[0]
    const parentInstances = taskStore.getInstanceIdsForTask('2.1')
    expect(parentInstances).toEqual(['2.1[0]'])

    const childInstances = taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')
    expect(childInstances).toEqual(['2.1.1[0]'])

    const child2Instances = taskStore.getInstanceIdsForTask('2.1.2', '2.1[0]')
    expect(child2Instances).toEqual(['2.1.2[0]'])
  })

  it('second repeatable instance gets unique children that do not overwrite the first', () => {
    // Add a second instance of 2.1
    const newInstanceId = taskStore.addRepeatableTaskInstance('2.1', '2')

    expect(newInstanceId).toBe('2.1[1]')

    // First instance children still exist and point to 2.1[0]
    const firstChildren = taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')
    expect(firstChildren).toEqual(['2.1.1[0]'])

    // Second instance has its own children pointing to 2.1[1]
    const secondChildren = taskStore.getInstanceIdsForTask('2.1.1', '2.1[1]')
    expect(secondChildren).toEqual(['2.1.1[1]'])

    // Both child instances exist in the store
    const allChildInstances = taskStore.getInstancesForTask('2.1.1')
    expect(allChildInstances).toHaveLength(2)
  })

  it('three repeatable instances each have their own distinct children', () => {
    taskStore.addRepeatableTaskInstance('2.1', '2')
    taskStore.addRepeatableTaskInstance('2.1', '2')

    // All three parent instances exist
    expect(taskStore.getInstanceIdsForTask('2.1')).toEqual(['2.1[0]', '2.1[1]', '2.1[2]'])

    // Each parent has its own child for 2.1.1
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')).toEqual(['2.1.1[0]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[1]')).toEqual(['2.1.1[1]'])
    expect(taskStore.getInstanceIdsForTask('2.1.1', '2.1[2]')).toEqual(['2.1.1[2]'])

    // Each parent has its own child for 2.1.2
    expect(taskStore.getInstanceIdsForTask('2.1.2', '2.1[0]')).toEqual(['2.1.2[0]'])
    expect(taskStore.getInstanceIdsForTask('2.1.2', '2.1[1]')).toEqual(['2.1.2[1]'])
    expect(taskStore.getInstanceIdsForTask('2.1.2', '2.1[2]')).toEqual(['2.1.2[2]'])
  })

  it('removing a repeatable instance does not affect other instances', () => {
    taskStore.addRepeatableTaskInstance('2.1', '2')

    // Remove the first instance
    taskStore.removeRepeatableTaskInstance('2.1[0]')

    // Second instance and its children still exist
    const remaining = taskStore.getInstanceIdsForTask('2.1')
    expect(remaining).toEqual(['2.1[1]'])

    const remainingChildren = taskStore.getInstanceIdsForTask('2.1.1', '2.1[1]')
    expect(remainingChildren).toEqual(['2.1.1[1]'])

    // First instance's children are gone
    const removedChildren = taskStore.getInstanceIdsForTask('2.1.1', '2.1[0]')
    expect(removedChildren).toEqual([])
  })

  it('children share the same groupId as their repeatable parent', () => {
    taskStore.addRepeatableTaskInstance('2.1', '2')

    const parent0 = taskStore.getInstanceById('2.1[0]')!
    const child0 = taskStore.getInstanceById('2.1.1[0]')!
    expect(child0.groupId).toBe(parent0.groupId)

    const parent1 = taskStore.getInstanceById('2.1[1]')!
    const child1 = taskStore.getInstanceById('2.1.1[1]')!
    expect(child1.groupId).toBe(parent1.groupId)

    // Different groups for different repeatable instances
    expect(parent0.groupId).not.toBe(parent1.groupId)
  })
})

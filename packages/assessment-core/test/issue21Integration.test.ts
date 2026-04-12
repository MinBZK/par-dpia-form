import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '../src/stores/tasks'
import { useAnswerStore } from '../src/stores/answers'
import { useSchemaStore } from '../src/stores/schemas'
import { applyStateToStores, rebuildRepeatableInstances } from '../src/utils/applyState'
import { useTaskDependencies } from '../src/composables/useTaskDependencies'
import { groupAnswers } from '../src/utils/groupedAnswers'
import { FormType, type Task } from '../src/models/dpia'
import type { AssessmentState, GroupedAnswerValue } from '../src/models/assessmentState'

import dpiaSchema from '../../../sources/generated/DPIA.json' with { type: 'json' }
import prodState from './fixtures/issue-21-prod-state.json' with { type: 'json' }

/**
 * Reproduces issue #21 using the actual production export and the real
 * DPIA schema. Before the fix, each reload of the form caused syncInstances
 * to duplicate target instances, inflating e.g. task 7.1 from 3 to 569 entries.
 */
describe('issue #21 — production state reload does not duplicate instances', () => {
  let taskStore: ReturnType<typeof useTaskStore>
  let answerStore: ReturnType<typeof useAnswerStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    taskStore = useTaskStore()
    answerStore = useAnswerStore()
    useSchemaStore()
    taskStore.setActiveNamespace(FormType.DPIA)
    answerStore.setActiveNamespace(FormType.DPIA)
  })

  it('collapses bloated repeatable target tasks to match source instance count', () => {
    const tasks = (dpiaSchema as { tasks: Task[] }).tasks
    const state = prodState as AssessmentState

    // Follow the same initialization order as Form.vue:
    //   1. init() creates task tree + default instances
    //   2. applyStateToStores() applies answers
    //   3. rebuildRepeatableInstances() adds instances for persisted indices
    //   4. syncInstances() reconciles targets to sources via instance_mapping
    taskStore.init(tasks, true)
    applyStateToStores(state, taskStore, answerStore)
    rebuildRepeatableInstances(
      taskStore,
      answerStore,
      state.answers as Record<string, GroupedAnswerValue>,
    )
    const { syncInstances } = useTaskDependencies()
    syncInstances.value()

    // Source task 3.1 has 3 instances in the production export.
    const sourceCount = taskStore.getInstanceIdsForTask('3.1').length
    expect(sourceCount).toBe(3)

    // Every task with a one_to_one instance_mapping on 3.1.1 must end up
    // with exactly `sourceCount` instances after sync, regardless of how
    // bloated the persisted state was.
    const mappedTaskIds = ['5.1', '6.1', '7.1', '8.1', '9.1', '10.1', '11.1', '13.1']
    for (const taskId of mappedTaskIds) {
      const targetIds = taskStore.getInstanceIdsForTask(taskId)
      expect(
        targetIds.length,
        `task ${taskId} should have ${sourceCount} instances, got ${targetIds.length}`,
      ).toBe(sourceCount)

      // Indices must align one-to-one with source indices (shared key contract).
      const indices = targetIds.map((id) => parseInt(id.match(/\[(\d+)\]$/)![1]))
      expect(indices.sort((a, b) => a - b)).toEqual([0, 1, 2])

      // Each target instance must be linked under the parent task id so
      // TaskGroup's `getInstancesForTask(taskId, parentInstanceId)` filter
      // returns them all — otherwise only some (or none) render in the UI.
      const parentTaskId = taskId.split('.')[0]
      const childrenUnderParent = taskStore.getInstanceIdsForTask(taskId, parentTaskId)
      expect(
        childrenUnderParent.sort(),
        `task ${taskId} should have all instances linked under parent ${parentTaskId}`,
      ).toEqual(targetIds.slice().sort())
    }

    // Nested repeatable children (e.g. 6.1.1 under 6.1) must be linked to
    // their outer parent instance, not to the bare task id. If the link is
    // broken, TaskGroup renders the outer instance as an empty group.
    for (const outerId of ['6.1', '7.1', '8.1', '9.1', '10.1', '11.1', '13.1']) {
      const innerId = `${outerId}.1`
      if (!taskStore.flatTasks.dpia[innerId]?.repeatable) continue
      for (const outerInstanceId of taskStore.getInstanceIdsForTask(outerId, outerId.split('.')[0])) {
        const innerInstances = taskStore.getInstanceIdsForTask(innerId, outerInstanceId)
        expect(
          innerInstances.length,
          `nested ${innerId} should have at least one instance linked to ${outerInstanceId}`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('round-trips the reconciled state through groupAnswers in order', () => {
    const tasks = (dpiaSchema as { tasks: Task[] }).tasks
    const state = prodState as AssessmentState

    taskStore.init(tasks, true)
    applyStateToStores(state, taskStore, answerStore)
    rebuildRepeatableInstances(
      taskStore,
      answerStore,
      state.answers as Record<string, GroupedAnswerValue>,
    )
    const { syncInstances } = useTaskDependencies()
    syncInstances.value()

    // Re-serialize answers to grouped form (the same path jsonExport uses).
    const grouped = groupAnswers(
      answerStore.answers.dpia,
      taskStore.flatTasks.dpia,
      taskStore.taskInstances.dpia,
    )

    // Mapped tasks serialize to sorted arrays of length `sourceCount` = 3.
    const task51 = grouped['5.1']
    expect(Array.isArray(task51)).toBe(true)
    if (Array.isArray(task51)) {
      expect(task51.map((el) => el._index)).toEqual([0, 1, 2])
    }

    // Task 2.1 (Persoonsgegevens) is independent — not affected by sync.
    // The production export has 14 entries with consecutive indices 0..13.
    const task21 = grouped['2.1']
    expect(Array.isArray(task21)).toBe(true)
    if (Array.isArray(task21)) {
      expect(task21.map((el) => el._index)).toEqual(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      )
    }
  })
})

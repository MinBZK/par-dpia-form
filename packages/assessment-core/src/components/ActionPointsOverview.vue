<script setup lang="ts">
import { useTaskStore } from '../stores/tasks'
import { useAnswerStore } from '../stores/answers'
import { computed } from 'vue'
import '@nldd/design-system/inline-dialog'

const taskStore = useTaskStore()
const answerStore = useAnswerStore()

interface ActionPointGroup {
  deelLabel: string
  items: string[]
}

// Collect every task group flagged `action_point_group` in the active form,
// ordered by ID, and gather the non-empty text answers from their children.
const actionPointGroups = computed<ActionPointGroup[]>(() => {
  const tasks = taskStore.getTasksFromNamespace(taskStore.activeNamespace)

  const groupTasks = Object.values(tasks)
    .filter((task) => task.action_point_group === true)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

  return groupTasks.map((groupTask) => {
    // Derive the section label from the parent deel (e.g. "1" from "1.actiepunten")
    const deelNummer = groupTask.id.split('.')[0]
    let deelLabel: string
    try {
      deelLabel = taskStore.taskById(deelNummer).task
    } catch {
      deelLabel = `Deel ${deelNummer}`
    }

    const items: string[] = []
    for (const childId of groupTask.childrenIds) {
      for (const instanceId of taskStore.getInstanceIdsForTask(childId)) {
        const answer = answerStore.getAnswer(instanceId)
        if (answer && typeof answer === 'string' && answer.trim()) {
          items.push(answer.trim())
        }
      }
    }

    return { deelLabel, items }
  })
})

const hasAnyActionPoints = computed(() =>
  actionPointGroups.value.some((group) => group.items.length > 0),
)
</script>

<template>
  <div class="task-fieldset">
    <fieldset class="task-fieldset__fieldset">
      <legend class="task-fieldset__legend">
        Overzicht actiepunten
      </legend>

      <nldd-inline-dialog v-if="!hasAnyActionPoints"
        icon="check-list" icon-color="secondary"
        text="Nog geen actiepunten"
        supporting-text="Actiepunten die je in de voorgaande delen invult, verschijnen hier."></nldd-inline-dialog>

      <template v-else>
        <div v-for="group in actionPointGroups" :key="group.deelLabel">
          <template v-if="group.items.length > 0">
            <h3>{{ group.deelLabel }}</h3>
            <ul>
              <li
                v-for="(item, index) in group.items"
                :key="index"
              >
                {{ item }}
              </li>
            </ul>
          </template>
        </div>
      </template>
    </fieldset>
  </div>
</template>

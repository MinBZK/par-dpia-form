<script setup lang="ts">
import { useTaskStore } from '@/stores/tasks'
import { useAnswerStore } from '@/stores/answers'
import { computed } from 'vue'

const props = defineProps<{
  actiepuntenTaskIds: string[]
}>()

const taskStore = useTaskStore()
const answerStore = useAnswerStore()

interface ActionPointGroup {
  deelLabel: string
  items: string[]
}

const actionPointGroups = computed<ActionPointGroup[]>(() => {
  const groups: ActionPointGroup[] = []

  for (const taskId of props.actiepuntenTaskIds) {
    // Get the parent deel number (e.g. "1" from "1.actiepunten")
    const deelNummer = taskId.split('.')[0]
    let deelLabel: string
    try {
      const deelTask = taskStore.taskById(deelNummer)
      deelLabel = deelTask.task
    } catch {
      deelLabel = `Deel ${deelNummer}`
    }

    // Get all instances of the repeatable text field within the group
    const textTaskId = `${taskId}.tekst`
    const textInstances = taskStore.getInstanceIdsForTask(textTaskId)
    const items: string[] = []

    for (const instanceId of textInstances) {
      const answer = answerStore.getAnswer(instanceId)
      if (answer && typeof answer === 'string' && answer.trim()) {
        items.push(answer.trim())
      }
    }

    groups.push({ deelLabel, items })
  }

  return groups
})

const hasAnyActionPoints = computed(() =>
  actionPointGroups.value.some((group) => group.items.length > 0),
)
</script>

<template>
  <div class="utrecht-form-fieldset rvo-form-fieldset">
    <fieldset
      class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset rvo-margin-block-start--xs rvo-margin-inline-start--xs"
    >
      <legend
        class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend"
      >
        Overzicht actiepunten
      </legend>

      <p v-if="!hasAnyActionPoints" class="utrecht-paragraph">
        Er zijn nog geen actiepunten ingevuld in de voorgaande delen.
      </p>

      <template v-else>
        <div v-for="group in actionPointGroups" :key="group.deelLabel">
          <template v-if="group.items.length > 0">
            <h3 class="utrecht-heading-3">{{ group.deelLabel }}</h3>
            <ul class="utrecht-unordered-list">
              <li
                v-for="(item, index) in group.items"
                :key="index"
                class="utrecht-unordered-list__item"
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

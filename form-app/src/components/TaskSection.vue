<script setup lang="ts">
import { computed } from 'vue'
import { type FlatTask, useTaskStore } from '@/stores/tasks'
import FormField from '@/components/FormField.vue'

const taskStore = useTaskStore()

const props = defineProps<{
  task: FlatTask
}>()

const isTaskGroup = computed(() => props.task.type.includes('task_group'))

const hasChildTasks = computed(() => props.task.childrenIds.length > 0)

function getTaskNameById(id: string): string {
  const task = taskStore.taskById(id)
  if (task === undefined) {
    console.warn(`No task found for id: ${id}`)
    return 'Unknown task'
  }
  return task.task
}
</script>

<template>
  <div class="rvo-max-width-layout--md">
    <div class="rvo-layout-margin-vertical--s">
      <h1 class="utrecht-heading-1">{{ task.task }}</h1>

      <!-- Task description -->
      <div class="rvo-layout-column rvo-layout-gap--2xl">
        <div v-if="task.description" class="utrecht-form-fieldset rvo-form-fieldset">
          <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
            <p class="utrecht-paragraph">
              {{ task.description }}
            </p>
          </fieldset>
        </div>

        <!-- If task is a task_group, then it has child tasks. -->
        <div v-if="isTaskGroup">
          <div v-if="hasChildTasks">
            <div class="rvo-layout-column rvo-layout-gap--2xl">
              <div v-for="id in task.childrenIds" :key="id" class="utrecht-form-fieldset rvo-form-fieldset">
                <!--If a child task has no children, simply display it.-->
                <div v-if="taskStore.taskById(id)?.childrenIds.length == 0 || false"
                  class="utrecht-form-fieldset rvo-form-fieldset">
                  <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
                    <div role="group" :aria-labelledby="`${id}-label`"
                      class="utrecht-form-field utrecht-form-field--text rvo-form-field">
                      <div class="rvo-form-field__label">
                        <label class="rvo-label" :id="`${id}-label`">
                          {{ getTaskNameById(id) }}
                        </label>
                      </div>
                      <FormField :task="taskStore.taskById(id)" />
                    </div>
                  </fieldset>
                </div>

                <!--If a child task has children, diplay all the childern.-->
                <div v-else>
                  <div class="utrecht-form-fieldset rvo-form-fieldset">
                    <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
                      <legend class="utrecht-form-fieldset__legend utrecht-form-fieldset__legend--html-legend">
                        {{ taskStore.taskById(id).task }}
                      </legend>
                      <div role="group" :aria-labelledby="`${task.id}-label`"
                        class="utrecht-form-field utrecht-form-field--text rvo-form-field">
                        <div v-for="child_id in taskStore.taskById(id).childrenIds" :key="child_id">
                          <div class="rvo-form-field__label">
                            <label class="rvo-label" :id="`${task.id}-label`">
                              {{ getTaskNameById(child_id) }}
                            </label>
                          </div>
                          <FormField :task="taskStore.taskById(child_id)" />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- If task is a task_group, then it never has child tasks and we just diplay its task. -->
        <div v-else>
          <div v-if="task.description" class="utrecht-form-fieldset rvo-form-fieldset">
            <fieldset class="utrecht-form-fieldset__fieldset utrecht-form-fieldset--html-fieldset">
              <div role="group" :aria-labelledby="`${task.id}-label`"
                class="utrecht-form-field utrecht-form-field--text rvo-form-field">
                <div class="rvo-form-field__label">
                  <label class="rvo-label" :id="`${task.id}-label`">
                    {{ task.task || 'Naamloze taak' }}
                  </label>
                </div>
                <FormField :task="task" />
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

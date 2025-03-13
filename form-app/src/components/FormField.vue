<script setup lang="ts">
import { TaskTypeValue } from '@/models/dpia.ts'
import { type FlatTask } from '@/stores/tasks'

const props = defineProps<{
  task: FlatTask | undefined
}>()

const hasType = (typeToCheck: TaskTypeValue): boolean => {
  return props.task.type.includes(typeToCheck)
}
</script>

<template>
  <!-- Text input field -->
  <div v-if="hasType('text_input')" class="field-group">
    <input :id="task.id" type="text" class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--lg"
      dir="auto" />
  </div>

  <!-- Text area -->
  <div v-if="hasType('open_text')" class="rvo-layout-column rvo-layout-gap--xs">
    <textarea :id="task.id" class="utrecht-textarea utrecht-textarea--html-textarea" dir="auto"></textarea>
  </div>

  <!-- Select dropdown -->
  <div v-else-if="hasType('select_option')" class="field-group">
    <div class="rvo-select-wrapper">
      <select :id="task.id" class="utrecht-select utrecht-select--html-select">
        <option value="" disabled selected>Selecteer een optie</option>
        <option v-for="option in task.options" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
    </div>
  </div>

  <!-- Date input -->
  <div v-else-if="hasType('date')" class="field-group">
    <input :id="task.id" type="date" class="utrecht-textbox utrecht-textbox--html-input utrecht-textbox--md"
      dir="auto" />
  </div>

  <!-- File upload -->
  <div v-else-if="hasType('upload_document')" class="field-group">
    <input :id="task.id" type="file" class="rvo-file-input" multiple />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

export interface ConflictField {
  fieldId: string
  label: string
  myValue: unknown
  theirValue: unknown
  myFormatted: string
  theirFormatted: string
}

const props = defineProps<{
  active: boolean
  fields: ConflictField[]
}>()

const emit = defineEmits<{
  resolve: [resolutions: Map<string, 'mine' | 'theirs'>]
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const selections = reactive<Record<string, 'mine' | 'theirs'>>({})

watch(() => props.active, (open) => {
  if (open) {
    for (const key of Object.keys(selections)) delete selections[key]
    for (const f of props.fields) selections[f.fieldId] = 'mine'
    dialogRef.value?.showModal()
  } else {
    dialogRef.value?.close()
  }
})

function handleResolve() {
  dialogRef.value?.close()
  emit('resolve', new Map(Object.entries(selections) as [string, 'mine' | 'theirs'][]))
}
</script>

<template>
  <dialog ref="dialogRef" class="confirm-dialog" @cancel.prevent>
    <div class="confirm-dialog__content confirm-dialog__content--wide">
      <h2 class="utrecht-heading-2">Bewerkingsconflict</h2>
      <p>
        Een andere gebruiker heeft dezelfde velden gewijzigd.
        Kies per veld welke waarde je wilt behouden.
      </p>

      <table class="conflict-table">
        <thead>
          <tr>
            <th>Vraag</th>
            <th>Mijn waarde</th>
            <th>Andere waarde</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in fields" :key="field.fieldId">
            <td class="conflict-field">{{ field.label }}</td>
            <td class="conflict-value conflict-value--mine" :class="{ 'conflict-value--selected': selections[field.fieldId] === 'mine' }">
              <label class="conflict-radio">
                <input
                  type="radio"
                  :name="`conflict-${field.fieldId}`"
                  :checked="selections[field.fieldId] === 'mine'"
                  @change="selections[field.fieldId] = 'mine'"
                />
                <span v-html="field.myFormatted"></span>
              </label>
            </td>
            <td class="conflict-value conflict-value--theirs" :class="{ 'conflict-value--selected': selections[field.fieldId] === 'theirs' }">
              <label class="conflict-radio">
                <input
                  type="radio"
                  :name="`conflict-${field.fieldId}`"
                  :checked="selections[field.fieldId] === 'theirs'"
                  @change="selections[field.fieldId] = 'theirs'"
                />
                <span v-html="field.theirFormatted"></span>
              </label>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="confirm-dialog__actions">
        <button
          type="button"
          class="rvo-button rvo-button--primary rvo-button--size-md"
          @click="handleResolve"
        >Toepassen</button>
      </div>
    </div>
  </dialog>
</template>

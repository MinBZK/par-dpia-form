<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/button'
import '@nldd/design-system/form-section'

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

// show/hide are optional: they only exist once the custom element is upgraded
// (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }
const dialogRef = ref<ModalDialogElement | null>(null)
const selections = reactive<Record<string, 'mine' | 'theirs'>>({})

watch(() => props.active, (open) => {
  if (open) {
    for (const key of Object.keys(selections)) delete selections[key]
    for (const f of props.fields) selections[f.fieldId] = 'mine'
    dialogRef.value?.show?.()
  } else {
    dialogRef.value?.hide?.()
  }
})

// Non-dismissable: a resolution must be chosen, so reopen if dismissed while
// the conflict is still active.
function onClose() {
  if (props.active) dialogRef.value?.show?.()
}

function handleResolve() {
  emit('resolve', new Map(Object.entries(selections) as [string, 'mine' | 'theirs'][]))
}
</script>

<template>
  <nldd-modal-dialog
    ref="dialogRef"
    accessible-label="Bewerkingsconflict"
    text="Bewerkingsconflict"
    @close="onClose"
  >
    <div>
      <p>
        Een andere gebruiker heeft dezelfde velden gewijzigd.
        Kies per veld welke waarde je wilt behouden.
      </p>

      <nldd-form-section
        v-for="field in fields"
        :key="field.fieldId"
        :text="field.label"
      >
        <!-- One wrapper per section: form-section migrates every direct child
             into its fieldset, so Vue keeps patching inside a node it owns. -->
        <div class="conflict-choices">
          <label
            class="conflict-option"
            :class="{ 'conflict-option--selected': selections[field.fieldId] === 'mine' }"
          >
            <input
              type="radio"
              :name="`conflict-${field.fieldId}`"
              :checked="selections[field.fieldId] === 'mine'"
              @change="selections[field.fieldId] = 'mine'"
            />
            <span>
              <span class="conflict-option__label">Jouw waarde</span>
              <span v-html="field.myFormatted"></span>
            </span>
          </label>
          <label
            class="conflict-option"
            :class="{ 'conflict-option--selected': selections[field.fieldId] === 'theirs' }"
          >
            <input
              type="radio"
              :name="`conflict-${field.fieldId}`"
              :checked="selections[field.fieldId] === 'theirs'"
              @change="selections[field.fieldId] = 'theirs'"
            />
            <span>
              <span class="conflict-option__label">Andere waarde</span>
              <span v-html="field.theirFormatted"></span>
            </span>
          </label>
        </div>
      </nldd-form-section>
    </div>
    <nldd-button slot="actions" variant="primary" text="Toepassen" @click="handleResolve"></nldd-button>
  </nldd-modal-dialog>
</template>

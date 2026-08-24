<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import '@nldd/design-system/button'
import '@nldd/design-system/modal-dialog'
import type { ImpactSummary } from '../utils/impactedAnswers'

const props = defineProps<{
  open: boolean
  label: string
  summary: ImpactSummary
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

// show/hide are optional: they only exist once the custom element is upgraded
// (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }

const dialog = ref<ModalDialogElement | null>(null)

const title = computed(() => `Weet je zeker dat je "${props.label}" wilt verwijderen?`)
const supportingText = computed(() =>
  props.summary.total === 0 ? 'Er zijn geen afhankelijke antwoorden ingevuld.' : '',
)

function sync(open: boolean) {
  if (!dialog.value) return
  if (open) dialog.value.show?.()
  else dialog.value.hide?.()
}

onMounted(() => sync(props.open))
watch(() => props.open, sync)

// The modal closes itself on Esc and fires `close`; route that through the
// shared open-state so the watch performs the single hide() (no hide loop).
const onClose = () => {
  if (props.open) emit('cancel')
}

onBeforeUnmount(() => {
  dialog.value?.hide?.()
})
</script>

<template>
  <nldd-modal-dialog
    ref="dialog"
    class="confirm-delete-dialog"
    variant="alert"
    :text="title"
    :supporting-text="supportingText"
    @close="onClose"
  >
    <p v-if="summary.total > 0">
      Dit wist ook
      {{ summary.total }} ingevuld{{ summary.total === 1 ? '' : 'e' }}
      antwoord{{ summary.total === 1 ? '' : 'en' }} in:
    </p>
    <ul v-if="summary.total > 0" class="confirm-delete-dialog__list">
      <li v-for="section in summary.bySection" :key="section.sectionId">
        Sectie {{ section.sectionId }}. {{ section.sectionLabel }} -
        {{ section.count }} antwoord{{ section.count === 1 ? '' : 'en' }}
        <span v-if="section.fieldNames.length > 0">({{ section.fieldNames.join(', ') }})</span>
      </li>
    </ul>

    <!-- The safe way out is the primary action; the destructive action is the
         secondary one (NLDD design guideline). -->
    <nldd-button slot="actions" variant="primary" text="Annuleren" @click="emit('cancel')"></nldd-button>
    <nldd-button slot="actions" variant="destructive" start-icon="trash" text="Ja, ga door met verwijderen"
      @click="emit('confirm')"></nldd-button>
  </nldd-modal-dialog>
</template>

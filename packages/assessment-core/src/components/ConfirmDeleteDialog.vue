<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ImpactSummary } from '../utils/impactedAnswers'
import UiButton from './ui/UiButton.vue'

const props = defineProps<{
  open: boolean
  label: string
  summary: ImpactSummary
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialog = ref<HTMLDialogElement | null>(null)

function sync(open: boolean) {
  if (!dialog.value) return
  if (open && !dialog.value.open) dialog.value.showModal()
  if (!open && dialog.value.open) dialog.value.close()
}

onMounted(() => sync(props.open))
watch(() => props.open, sync)

const onNativeClose = () => {
  if (props.open) emit('cancel')
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="confirm-delete-dialog" @close="onNativeClose">
    <div class="confirm-delete-dialog__content">
      <h2 class="utrecht-heading-2">Weet je zeker dat je "{{ label }}" wilt verwijderen?</h2>

      <p v-if="summary.total > 0" class="utrecht-paragraph">
        Dit wist ook
        {{ summary.total }} ingevuld{{ summary.total === 1 ? '' : 'e' }}
        antwoord{{ summary.total === 1 ? '' : 'en' }} in:
      </p>
      <ul v-if="summary.total > 0" class="utrecht-unordered-list">
        <li v-for="section in summary.bySection" :key="section.sectionId" class="utrecht-unordered-list__item">
          Sectie {{ section.sectionId }}. {{ section.sectionLabel }} —
          {{ section.count }} antwoord{{ section.count === 1 ? '' : 'en' }}
          <span v-if="section.fieldNames.length > 0">({{ section.fieldNames.join(', ') }})</span>
        </li>
      </ul>

      <p v-else class="utrecht-paragraph">
        Er zijn geen afhankelijke antwoorden ingevuld.
      </p>

      <div class="confirm-delete-dialog__actions">
        <UiButton variant="tertiary" label="Annuleren" @click="emit('cancel')" />
        <UiButton variant="warning" icon="verwijderen" label="Ja, ga door met verwijderen"
          @click="emit('confirm')" />
      </div>
    </div>
  </dialog>
</template>

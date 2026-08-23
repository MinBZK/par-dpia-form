<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import UiButton from './UiButton.vue'

const props = defineProps<{
  open: boolean
  title: string
  confirmLabel: string
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

// Fires for Escape too, which is why cancelling lives here rather than only on
// the button.
const onNativeClose = () => {
  if (props.open) emit('cancel')
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="confirm-dialog" @close="onNativeClose">
    <div class="confirm-dialog__content">
      <h2 class="utrecht-heading-2">{{ title }}</h2>
      <slot />
      <div class="confirm-dialog__actions">
        <UiButton variant="tertiary" label="Annuleren" @click="emit('cancel')" />
        <UiButton variant="warning" :label="confirmLabel" @click="emit('confirm')" />
      </div>
    </div>
  </dialog>
</template>

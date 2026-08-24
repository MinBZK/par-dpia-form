<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import '@nldd/design-system/modal-dialog'
import '@nldd/design-system/button'

const { sessionExpired, relogin } = useAuth()

// show/hide are optional: they only exist once the custom element is upgraded
// (not in jsdom unit tests).
type ModalDialogElement = HTMLElement & { show?: () => void; hide?: () => void }
const dialogRef = ref<ModalDialogElement | null>(null)

watch(sessionExpired, (expired) => {
  if (expired) dialogRef.value?.show?.()
})

// Non-dismissable: the only way out is to log in again, so reopen the modal if
// it is dismissed (Esc / backdrop) while the session is still expired.
function onClose() {
  if (sessionExpired.value) dialogRef.value?.show?.()
}
</script>

<template>
  <nldd-modal-dialog
    ref="dialogRef"
    variant="alert"
    accessible-label="Je bent uitgelogd"
    text="Je bent uitgelogd"
    supporting-text="Je bent automatisch uitgelogd omdat je langere tijd niet actief was. Log opnieuw in om verder te gaan. Je werk wordt bewaard."
    @close="onClose"
  >
    <nldd-button slot="actions" variant="primary" text="Opnieuw inloggen" @click="relogin()"></nldd-button>
  </nldd-modal-dialog>
</template>

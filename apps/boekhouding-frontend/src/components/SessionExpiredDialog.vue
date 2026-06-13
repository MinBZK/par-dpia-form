<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'

const { sessionExpired, relogin } = useAuth()
const dialogRef = ref<HTMLDialogElement | null>(null)

watch(sessionExpired, (expired) => {
  if (expired) {
    dialogRef.value?.showModal()
  }
})
</script>

<template>
  <dialog ref="dialogRef" class="confirm-dialog" aria-labelledby="session-expired-title" @cancel.prevent>
    <div class="confirm-dialog__content">
      <h2 id="session-expired-title" class="utrecht-heading-2">Je bent uitgelogd</h2>
      <p>
        Je bent automatisch uitgelogd omdat je langere tijd niet actief was.
        Log opnieuw in om verder te gaan. Je werk wordt bewaard.
      </p>
      <div class="confirm-dialog__actions">
        <button
          type="button"
          class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-md"
          @click="relogin()"
        >Opnieuw inloggen</button>
      </div>
    </div>
  </dialog>
</template>

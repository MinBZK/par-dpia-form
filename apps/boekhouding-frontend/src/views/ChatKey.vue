<script setup lang="ts">
import { computed, ref } from 'vue'
import { UiButton } from '@overheid-assessment/core'
import { ApiError, chatKeys, type ChatKey } from '../api'
import AppHeader from '../components/AppHeader.vue'

// A page for the AIIA experiment: hands out a chat key for the command-line
// script (scripts/experiment/chat.mjs, see docs/experiment/README.md).
const chatKey = ref<ChatKey | null>(null)
const creating = ref(false)
const error = ref<string | null>(null)
const copyState = ref<'idle' | 'done' | 'error'>('idle')

// Only shown next to a key, so there is always one to read.
const validUntil = computed(() =>
  new Date(chatKey.value!.expiresAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }),
)

async function create(): Promise<void> {
  creating.value = true
  error.value = null
  copyState.value = 'idle'
  try {
    chatKey.value = await chatKeys.create()
  } catch (e) {
    // A 503 explains itself (keys are off here); anything else is a retry.
    error.value = e instanceof ApiError && e.status === 503
      ? e.message
      : 'Het maken van een chat-sleutel is mislukt. Probeer het opnieuw.'
  } finally {
    creating.value = false
  }
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(chatKey.value!.key)
    copyState.value = 'done'
  } catch {
    copyState.value = 'error'
  }
}
</script>

<template>
  <div class="rvo-max-width-layout rvo-max-width-layout--md rvo-max-width-layout-inline-padding--md">
    <AppHeader back-route="/projecten" back-label="Naar projecten">
      <template #left>
        <h1 class="utrecht-heading-1 rvo-heading--no-margins">Chat-sleutel</h1>
      </template>
    </AppHeader>

    <p>
      Met een chat-sleutel gebruik je het taalmodel vanaf je eigen computer, met het script
      <code>pnpm experiment:chat</code>. De sleutel werkt alleen voor de chat, niet voor je
      projecten, en verloopt na een paar uur. Plak hem in het script als het erom vraagt.
    </p>
    <p>
      Deel de sleutel niet en zet hem niet in code, een bestand of een chat. Gebruik geen echte
      persoonsgegevens in je vragen: alles wat je stuurt gaat naar het taalmodel.
    </p>

    <UiButton :label="chatKey ? 'Maak een nieuwe chat-sleutel' : 'Maak chat-sleutel'" :disabled="creating" @click="create" />

    <div v-if="error" class="rvo-alert rvo-alert--warning" role="alert">{{ error }}</div>

    <div v-if="chatKey">
      <label class="utrecht-form-label" for="chat-key">Je chat-sleutel, geldig tot {{ validUntil }}</label>
      <textarea
        id="chat-key"
        class="utrecht-textarea"
        readonly
        rows="4"
        :value="chatKey.key"
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
      <UiButton variant="secondary" size="sm" label="Kopieer sleutel" @click="copy" />
      <p role="status">
        <template v-if="copyState === 'done'">Gekopieerd.</template>
        <template v-else-if="copyState === 'error'">Kopiëren lukte niet; selecteer de sleutel en kopieer hem zelf.</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', filename: string): void
}>()

const saveFormRef = ref<HTMLDivElement | null>(null)

// Generate filename based on timestamp
const filename = computed((): string => {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-') // Replace colons with hyphens
    .replace(/\..+/, '') // Remove milliseconds
    .replace('T', '_') // Replace T with underscore

  return `DPIA_${timestamp}.json`
})

// Handle ESC key to close modal
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.isOpen) {
    closeModal()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

// Handle clicking outside the modal to close it
const handleClickOutside = (event: MouseEvent) => {
  if (saveFormRef.value && !saveFormRef.value.contains(event.target as Node)) {
    closeModal()
  }
}

const closeModal = () => {
  emit('close')
}

const handleSave = () => {
  emit('save', filename.value)
  closeModal()
}
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="handleClickOutside">
    <div
      ref="saveFormRef"
      class="save-modal"
      aria-labelledby="save-form-title"
      role="dialog"
      aria-modal="true"
    >
      <h2 id="save-form-title" class="utrecht-heading-2">Formulier opslaan</h2>

      <div class="rvo-layout-margin-vertical--s">
        <p class="utrecht-paragraph">Sla het formulier lokaal op om je voortgang te bewaren.</p>
        <p class="utrecht-paragraph">
          Het bestand <strong>{{ filename }}</strong> kan later weer worden geselecteerd om mee
          verder te werken.
        </p>
        <p class="utrecht-paragraph">
          Je kunt dit bestand ook delen met collega's zodat zij ermee aan de slag kunnen.
        </p>
      </div>

      <p
        class="utrecht-button-group rvo-action-groul--position-right"
        role="group"
        aria-label="Formulier opslag"
      >
        <UiButton variant="tertiary" label="Annuleren" @click="closeModal" />
        <UiButton variant="primary" label="Opslaan" @click="handleSave" />
      </p>
    </div>
  </div>
</template>

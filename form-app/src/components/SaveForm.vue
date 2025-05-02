<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import { generateFilename } from '@/utils/fileName'
import { useTaskStore } from '@/stores/tasks'
import { FormType } from '@/models/dpia.ts';
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', filename: string): void
}>()

const saveFormRef = ref<HTMLDivElement | null>(null)
const taskStore = useTaskStore()

// Generate filename based on timestamp
const filename = computed((): string => {
  return generateFilename(taskStore.activeNamespace, 'json')
})

// Handle ESC key to close modal
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.isOpen) {
    closeModal()
  }
}

const formName = computed(() =>
  taskStore.activeNamespace === FormType.DPIA ? 'DPIA' : 'Pre-scan DPIA'
)

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
    <div ref="saveFormRef" class="save-modal" aria-labelledby="save-form-title" role="dialog" aria-modal="true">
      <h2 id="save-form-title" class="utrecht-heading-2">Sla je {{ formName }} op als bestand</h2>

      <div class="rvo-layout-margin-vertical--s">
        <p class="utrecht-paragraph">Klik op "Bestand maken" om je werk lokaal op te slaan.</p>
        <p class="utrecht-paragraph">
          <strong>Bestandsnaam: {{ filename }}</strong>
        </p>
        <p class="utrecht-paragraph">
        Je kunt dit bestand later in het startscherm van het formulier weer openen.
        </p>
        <p class="utrecht-paragraph">
        Stuur het bestand door, zodat een collega het kan uploaden in de tool en verder kan
        werken.
        </p>
      </div>

      <p class="utrecht-button-group rvo-action-groul--position-right" role="group" aria-label="Formulier opslag">
        <UiButton variant="tertiary" label="Annuleren" @click="closeModal" />
        <UiButton variant="primary" label="Bestand maken" @click="handleSave" />
      </p>
    </div>
  </div>
</template>

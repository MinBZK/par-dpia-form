<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

export type ExportFormat = 'pdf' | 'json' | 'markdown'

const emit = defineEmits<{
  (e: 'export', format: ExportFormat): void
}>()

// In `split` mode the main button exports PDF directly and a chevron toggle
// opens the full options panel; otherwise a single compact "Exporteer" disclosure.
defineProps<{ split?: boolean }>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// Close when a click lands outside the menu container.
function handleDocumentClick(event: MouseEvent) {
  /* istanbul ignore if @preserve -- defensive: the document listener is only ever active while the menu is open and mounted, so containerRef is always bound when this fires */
  if (!containerRef.value) return
  if (!containerRef.value.contains(event.target as Node)) {
    close()
  }
}

function addOutsideListener() {
  document.addEventListener('click', handleDocumentClick)
}

function removeOutsideListener() {
  document.removeEventListener('click', handleDocumentClick)
}

function openMenu() {
  open.value = true
  // Defer so the click that opened the menu does not immediately close it.
  setTimeout(addOutsideListener, 0)
}

function close() {
  // No-op when already closed — e.g. the split button's direct PDF action calls
  // choose() -> close() while the panel was never opened.
  if (!open.value) return
  open.value = false
  removeOutsideListener()
}

function toggle() {
  if (open.value) {
    close()
  } else {
    openMenu()
  }
}

// Escape closes the menu and returns focus to the trigger.
function handleEscape() {
  if (!open.value) return
  close()
  triggerRef.value?.focus()
}

function choose(format: ExportFormat) {
  emit('export', format)
  close()
}

onBeforeUnmount(removeOutsideListener)
</script>

<template>
  <div ref="containerRef" class="export-menu" @keydown.escape="handleEscape">
    <!-- Split button: main action exports PDF directly, the chevron toggle opens
         all options. Disclosure pattern (real buttons in the panel), not an ARIA
         menu — rely on aria-expanded; do not advertise aria-haspopup="menu". -->
    <div v-if="split" class="export-menu__split">
      <button
        type="button"
        class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md export-menu__split-main"
        @click="choose('pdf')"
      >
        Exporteer als PDF
      </button>
      <button
        ref="triggerRef"
        type="button"
        class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-md export-menu__split-toggle"
        :aria-expanded="open"
        aria-label="Meer exportopties"
        @click="toggle"
      >
        <span
          class="utrecht-icon rvo-icon rvo-icon-delta-omlaag rvo-icon--sm rvo-icon--hemelblauw"
          aria-hidden="true"
        ></span>
      </button>
    </div>
    <!-- Compact disclosure used in the header bar. -->
    <button
      v-else
      ref="triggerRef"
      type="button"
      class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs utrecht-button--icon-gap"
      :aria-expanded="open"
      @click="toggle"
    >
      Exporteer
      <span
        class="utrecht-icon rvo-icon rvo-icon-delta-omlaag rvo-icon--sm rvo-icon--hemelblauw"
        aria-hidden="true"
      ></span>
    </button>
    <div v-if="open" class="export-menu__panel">
      <button type="button" class="export-menu__item" @click="choose('pdf')">Exporteer als PDF</button>
      <button type="button" class="export-menu__item" @click="choose('json')">Exporteer als JSON</button>
      <button type="button" class="export-menu__item" @click="choose('markdown')">Exporteer als Markdown</button>
    </div>
  </div>
</template>

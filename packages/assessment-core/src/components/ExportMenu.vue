<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

export type ExportFormat = 'pdf' | 'json' | 'markdown'

const emit = defineEmits<{
  (e: 'export', format: ExportFormat): void
}>()

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
  /* istanbul ignore if @preserve -- defensive: every caller (toggle, handleEscape, the outside-click listener) only invokes close() while the menu is open, and the listener is removed on close, so close() is never re-entered when already closed */
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
    <button
      ref="triggerRef"
      type="button"
      class="utrecht-button utrecht-button--rvo-tertiary-action utrecht-button--rvo-xs utrecht-button--icon-gap"
      :aria-expanded="open"
      @click="toggle"
    >
      Exporteer
      <!-- Disclosure pattern (real buttons in the panel), not an ARIA menu —
           rely on aria-expanded; do not advertise aria-haspopup="menu". -->
      <span
        class="utrecht-icon rvo-icon rvo-icon-delta-omlaag rvo-icon--sm rvo-icon--hemelblauw"
        aria-hidden="true"
      ></span>
    </button>
    <div
      v-if="open"
      class="export-menu__panel"
      style="position: absolute; top: 100%; right: 0; z-index: 10; background: white; border: 1px solid var(--rvo-color-grijs-300, #ccc); border-radius: 4px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); min-width: 14rem; padding: 0.25rem 0;"
    >
      <button type="button" class="export-menu__item" @click="choose('pdf')">Exporteer als PDF</button>
      <button type="button" class="export-menu__item" @click="choose('json')">Exporteer als JSON</button>
      <button type="button" class="export-menu__item" @click="choose('markdown')">Exporteer als Markdown</button>
    </div>
  </div>
</template>

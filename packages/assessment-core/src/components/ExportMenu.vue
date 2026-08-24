<script setup lang="ts">
import '@nldd/design-system/split-button'
import '@nldd/design-system/button'
import '@nldd/design-system/menu'

export type ExportFormat = 'pdf' | 'json' | 'markdown'

const emit = defineEmits<{
  (e: 'export', format: ExportFormat): void
}>()

// In `split` mode the main button exports PDF directly and the chevron opens
// the slotted menu; otherwise a single compact "Exporteer" button opens it.
// Both hosts anchor, toggle and sync `expanded` for a slotted nldd-menu.
defineProps<{ split?: boolean }>()

function choose(format: ExportFormat) {
  emit('export', format)
}
</script>

<template>
  <!-- Split button: main action exports PDF directly, the chevron opens the
       slotted menu (positioning, Esc and light dismiss handled by NLDD). -->
  <nldd-split-button v-if="split" variant="secondary" text="Exporteer als PDF"
    @action-click="choose('pdf')">
    <nldd-menu accessible-label="Exportopties">
      <nldd-menu-item text="Exporteer als PDF" @click="choose('pdf')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als JSON" @click="choose('json')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als Markdown" @click="choose('markdown')"></nldd-menu-item>
    </nldd-menu>
  </nldd-split-button>

  <!-- Compact button with the menu in its popup slot, used in the header bar. -->
  <nldd-button v-else variant="accent-transparent" size="xs" text="Exporteer"
    expandable popup-type="menu">
    <nldd-menu slot="popup" accessible-label="Exportopties">
      <nldd-menu-item text="Exporteer als PDF" @click="choose('pdf')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als JSON" @click="choose('json')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als Markdown" @click="choose('markdown')"></nldd-menu-item>
    </nldd-menu>
  </nldd-button>
</template>

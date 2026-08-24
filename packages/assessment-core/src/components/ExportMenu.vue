<script setup lang="ts">
import '@nldd/design-system/split-button'
import '@nldd/design-system/button'
import '@nldd/design-system/menu'
import '@nldd/design-system/menu-bar-item'

export type ExportFormat = 'pdf' | 'json' | 'markdown'

const emit = defineEmits<{
  (e: 'export', format: ExportFormat): void
}>()

// Three hosts for the same menu: `split` exports PDF straight from the main
// button, `menuBar` sits in the utility menu bar of the top navigation, and the
// default is a compact button. All three anchor, toggle and sync `expanded` for
// a slotted nldd-menu themselves.
defineProps<{ split?: boolean; menuBar?: boolean }>()

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

  <!-- Item in the utility menu bar of the top navigation. -->
  <nldd-menu-bar-item v-else-if="menuBar" text="Exporteer" icon="download" expandable>
    <nldd-menu accessible-label="Exportopties">
      <nldd-menu-item text="Exporteer als PDF" @click="choose('pdf')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als JSON" @click="choose('json')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als Markdown" @click="choose('markdown')"></nldd-menu-item>
    </nldd-menu>
  </nldd-menu-bar-item>

  <!-- Compact button with the menu in its popup slot. -->
  <nldd-button v-else variant="accent-transparent" size="xs" text="Exporteer"
    expandable popup-type="menu">
    <nldd-menu slot="popup" accessible-label="Exportopties">
      <nldd-menu-item text="Exporteer als PDF" @click="choose('pdf')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als JSON" @click="choose('json')"></nldd-menu-item>
      <nldd-menu-item text="Exporteer als Markdown" @click="choose('markdown')"></nldd-menu-item>
    </nldd-menu>
  </nldd-button>
</template>

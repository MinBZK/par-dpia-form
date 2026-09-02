<script setup lang="ts">
import '@nldd/design-system/split-button'
import '@nldd/design-system/button'
import '@nldd/design-system/menu'
import '@nldd/design-system/menu-bar-item'

export type ExportFormat = 'pdf' | 'json' | 'markdown'

// The trigger already says "Exporteer", so the items only name the format.
// The split button is the exception: its menu hangs off the chevron, with no
// "Exporteer" label above it, so there the items spell the action out.
const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'pdf', label: 'PDF' },
  { format: 'json', label: 'JSON' },
  { format: 'markdown', label: 'Markdown' },
]

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
    <nldd-menu>
      <nldd-menu-item v-for="f in FORMATS" :key="f.format" :text="`Exporteer als ${f.label}`"
        @select="choose(f.format)"></nldd-menu-item>
    </nldd-menu>
  </nldd-split-button>

  <!-- Item in the utility menu bar of the top navigation. -->
  <nldd-menu-bar-item v-else-if="menuBar" text="Exporteer" icon="download"
    content-priority="icon" expandable>
    <nldd-menu width="10rem">
      <nldd-menu-item v-for="f in FORMATS" :key="f.format" :text="f.label"
        @select="choose(f.format)"></nldd-menu-item>
    </nldd-menu>
  </nldd-menu-bar-item>

  <!-- Compact button with the menu in its popup slot. -->
  <nldd-button v-else variant="accent-transparent" size="xs" text="Exporteer"
    expandable popup-type="menu">
    <nldd-menu slot="popup" width="10rem">
      <nldd-menu-item v-for="f in FORMATS" :key="f.format" :text="f.label"
        @select="choose(f.format)"></nldd-menu-item>
    </nldd-menu>
  </nldd-button>
</template>

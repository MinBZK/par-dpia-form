<script setup lang="ts">
import '@nldd/design-system/split-button'
import '@nldd/design-system/button'
import '@nldd/design-system/menu'
import '@nldd/design-system/toolbar'

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
// button, `toolbar` is a button in the page toolbar (with its own overflow
// entries), and the default is a compact button. All three anchor, toggle and sync `expanded` for
// a slotted nldd-menu themselves.
defineProps<{ split?: boolean; toolbar?: boolean }>()

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

  <!-- In the page toolbar: a button that keeps its label while there is room,
       and a matching menu item for when the toolbar pushes it into overflow. -->
  <nldd-toolbar-item v-else-if="toolbar" slot="end">
    <nldd-button variant="accent-transparent" size="sm" start-icon="download"
      text="Exporteer" expandable popup-type="menu">
      <nldd-menu slot="popup" width="10rem">
        <nldd-menu-item v-for="f in FORMATS" :key="f.format" :text="f.label"
          @select="choose(f.format)"></nldd-menu-item>
      </nldd-menu>
    </nldd-button>
    <nldd-menu-item v-for="f in FORMATS" :key="`ov-${f.format}`" slot="overflow"
      :text="`Exporteer als ${f.label}`" @select="choose(f.format)"></nldd-menu-item>
  </nldd-toolbar-item>

  <!-- Compact button with the menu in its popup slot. -->
  <nldd-button v-else variant="accent-transparent" size="xs" text="Exporteer"
    expandable popup-type="menu">
    <nldd-menu slot="popup" width="10rem">
      <nldd-menu-item v-for="f in FORMATS" :key="f.format" :text="f.label"
        @select="choose(f.format)"></nldd-menu-item>
    </nldd-menu>
  </nldd-button>
</template>

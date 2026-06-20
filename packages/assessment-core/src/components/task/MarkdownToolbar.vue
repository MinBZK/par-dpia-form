<script setup lang="ts">
import { ref } from 'vue'
import type { MarkdownCommand } from '../../utils/markdownCommands'
import { formatShortcut } from '../../utils/keyboardShortcut'

// Minimalist formatting toolbar for the markdown editor. Implements the W3C ARIA
// Authoring Practices "toolbar" pattern: a single tab stop, roving tabindex, and
// arrow/Home/End navigation between controls. Buttons emit a semantic command;
// the parent editor applies it to whatever surface it owns.
//
// Icons are inline, monochrome line icons (stroke="currentColor") so they inherit
// the button colour, render crisply at small sizes, and need no external asset —
// which keeps them working in the offline single-file build and under the strict
// CSP (SVG presentation attributes are not inline styles). The RVO/NL Design
// System icon set is illustrative and has no text-formatting glyphs, so we use
// Tabler Icons (MIT, https://tabler.io/icons) for bold/italic/heading/list/link.
const emit = defineEmits<{ command: [command: MarkdownCommand] }>()

interface ToolbarButton {
  command: MarkdownCommand
  label: string
  paths: string[]
  // The editor's keyboard shortcut for this command (Mod + key), shown in the
  // tooltip. Omitted for commands without a shortcut (heading, divider, link).
  shortcut?: { key: string; shift?: boolean }
}

const buttons: ToolbarButton[] = [
  { command: 'bold', label: 'Vet', shortcut: { key: 'B' }, paths: ['M7 5h6a3.5 3.5 0 0 1 0 7h-6z', 'M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7'] },
  { command: 'italic', label: 'Cursief', shortcut: { key: 'I' }, paths: ['M11 5h6', 'M7 19h6', 'M14 5l-4 14'] },
  { command: 'strikethrough', label: 'Doorhalen', shortcut: { key: 'S', shift: true }, paths: ['M5 12h14', 'M16 6.5a4 2 0 0 0 -4 -1.5h-1a3.5 3.5 0 0 0 0 7', 'M8.5 17.5a4 2 0 0 0 4 1.5h1a3.5 3.5 0 0 0 .5 -6.95'] },
  { command: 'heading', label: 'Kop', paths: ['M7 5v14', 'M17 5v14', 'M7 12h10'] },
  { command: 'bulletList', label: 'Opsommingslijst', shortcut: { key: '8', shift: true }, paths: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M5 6h.01', 'M5 12h.01', 'M5 18h.01'] },
  { command: 'orderedList', label: 'Genummerde lijst', shortcut: { key: '7', shift: true }, paths: ['M11 6h9', 'M11 12h9', 'M12 18h8', 'M4 16a2 2 0 1 1 4 0c0 .591 -.602 1.46 -1 2l-3 3h4', 'M6 10v-6l-2 2'] },
  { command: 'blockquote', label: 'Citaat', shortcut: { key: 'B', shift: true }, paths: ['M6 15h15', 'M21 19h-15', 'M15 11h6', 'M21 7h-6', 'M9 9h1a1 1 0 0 1 -1 1v-2.5a2 2 0 0 1 2 -2', 'M3 9h1a1 1 0 0 1 -1 1v-2.5a2 2 0 0 1 2 -2'] },
  { command: 'code', label: 'Code', shortcut: { key: 'E' }, paths: ['M7 8l-4 4l4 4', 'M17 8l4 4l-4 4', 'M14 4l-4 16'] },
  { command: 'divider', label: 'Scheidingslijn', paths: ['M4 12h16'] },
  { command: 'link', label: 'Link', paths: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'] },
]

// macOS shows ⌘; everywhere else Ctrl. Computed once for the tooltips.
const isMac = navigator.platform.toUpperCase().includes('MAC')

function buttonTitle(button: ToolbarButton): string {
  if (!button.shortcut) return button.label
  return `${button.label} (${formatShortcut(button.shortcut.key, button.shortcut.shift ?? false, isMac)})`
}

const activeIndex = ref(0)

function onKeydown(event: KeyboardEvent) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()

  const last = buttons.length - 1
  let next = activeIndex.value
  if (event.key === 'ArrowRight') next = activeIndex.value === last ? 0 : activeIndex.value + 1
  else if (event.key === 'ArrowLeft') next = activeIndex.value === 0 ? last : activeIndex.value - 1
  else if (event.key === 'Home') next = 0
  else next = last

  activeIndex.value = next
  const elements = (event.currentTarget as HTMLElement).querySelectorAll('button')
  ;(elements[next] as HTMLButtonElement).focus()
}
</script>

<template>
  <div class="markdown-toolbar" role="toolbar" aria-label="Tekstopmaak" @keydown="onKeydown">
    <button v-for="(button, index) in buttons" :key="button.command" type="button"
      class="markdown-toolbar__button"
      :tabindex="index === activeIndex ? 0 : -1"
      :aria-label="button.label" :title="buttonTitle(button)"
      @mousedown.prevent
      @click="emit('command', button.command)"
      @focus="activeIndex = index">
      <svg class="markdown-toolbar__icon" viewBox="0 0 24 24" width="18" height="18"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-for="(d, i) in button.paths" :key="i" :d="d" />
      </svg>
    </button>
  </div>
</template>

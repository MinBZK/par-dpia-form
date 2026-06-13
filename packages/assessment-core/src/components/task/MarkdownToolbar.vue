<script setup lang="ts">
import { ref } from 'vue'
import type { MarkdownCommand } from '../../utils/markdownCommands'

// Minimalist formatting toolbar for the markdown editor. Implements the W3C ARIA
// Authoring Practices "toolbar" pattern: a single tab stop, roving tabindex, and
// arrow/Home/End navigation between controls. Buttons emit a semantic command;
// the parent editor applies it to whatever surface it owns.
const emit = defineEmits<{ command: [command: MarkdownCommand] }>()

interface ToolbarButton {
  command: MarkdownCommand
  label: string
  glyph: string
  modifier?: string
}

const buttons: ToolbarButton[] = [
  { command: 'bold', label: 'Vet', glyph: 'B', modifier: 'markdown-toolbar__button--bold' },
  { command: 'italic', label: 'Cursief', glyph: 'I', modifier: 'markdown-toolbar__button--italic' },
  { command: 'heading', label: 'Kop', glyph: 'H' },
  { command: 'bulletList', label: 'Opsommingslijst', glyph: '•' },
  { command: 'orderedList', label: 'Genummerde lijst', glyph: '1.' },
  { command: 'link', label: 'Link', glyph: '\u{1F517}' },
]

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
      class="markdown-toolbar__button" :class="button.modifier"
      :tabindex="index === activeIndex ? 0 : -1"
      :aria-label="button.label" :title="button.label"
      @click="emit('command', button.command)"
      @focus="activeIndex = index">
      <span aria-hidden="true">{{ button.glyph }}</span>
    </button>
  </div>
</template>

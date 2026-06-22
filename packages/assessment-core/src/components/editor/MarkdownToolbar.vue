<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { MarkdownCommand } from '../../utils/markdownCommands'
import { formatShortcut } from '../../utils/keyboardShortcut'

// Formatting toolbar for the markdown editor. A block-style dropdown (paragraph /
// Kop 1..6) sits first, then grouped icon buttons separated by thin dividers.
// Implements the W3C ARIA "toolbar" pattern: a single tab stop with roving
// tabindex and arrow/Home/End navigation across the controls; the dropdown opens
// a menu of block types. Buttons emit a semantic command and light up (is-active /
// aria-pressed) when their mark or node is active at the cursor, so it is clear a
// second click toggles it off.
//
// Icons are inline, monochrome line icons (stroke="currentColor") — no external
// asset, so they work offline and under the strict CSP (SVG presentation
// attributes are not inline styles). They are Tabler Icons (MIT, https://tabler.io/icons).
const props = defineProps<{
  // Heading levels offered in the dropdown (1..6).
  headingLevels: number[]
  // The block at the cursor: a heading level, or null for a paragraph.
  activeBlock: number | null
  // Which toggle commands are active at the cursor, keyed by command.
  activeMarks: Record<string, boolean>
}>()

const emit = defineEmits<{
  command: [command: MarkdownCommand]
  heading: [level: number | null]
}>()

interface Btn {
  command: MarkdownCommand
  label: string
  paths: string[]
  // Toggle buttons reflect active state (aria-pressed + highlight); inserts
  // (divider, link) do not.
  toggle?: boolean
  // The editor's keyboard shortcut (Mod + key), shown in the tooltip.
  shortcut?: { key: string; shift?: boolean }
}

// Buttons in visual groups; a separator renders between groups.
const groups: Btn[][] = [
  [
    { command: 'bold', label: 'Vet', toggle: true, shortcut: { key: 'B' }, paths: ['M7 5h6a3.5 3.5 0 0 1 0 7h-6z', 'M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7'] },
    { command: 'italic', label: 'Cursief', toggle: true, shortcut: { key: 'I' }, paths: ['M11 5h6', 'M7 19h6', 'M14 5l-4 14'] },
    { command: 'underline', label: 'Onderstrepen', toggle: true, shortcut: { key: 'U' }, paths: ['M7 5v5a5 5 0 0 0 10 0v-5', 'M5 19h14'] },
    { command: 'strikethrough', label: 'Doorhalen', toggle: true, shortcut: { key: 'S', shift: true }, paths: ['M5 12h14', 'M16 6.5a4 2 0 0 0 -4 -1.5h-1a3.5 3.5 0 0 0 0 7', 'M8.5 17.5a4 2 0 0 0 4 1.5h1a3.5 3.5 0 0 0 .5 -6.95'] },
  ],
  [
    { command: 'bulletList', label: 'Opsommingslijst', toggle: true, shortcut: { key: '8', shift: true }, paths: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M5 6h.01', 'M5 12h.01', 'M5 18h.01'] },
    { command: 'orderedList', label: 'Genummerde lijst', toggle: true, shortcut: { key: '7', shift: true }, paths: ['M11 6h9', 'M11 12h9', 'M12 18h8', 'M4 16a2 2 0 1 1 4 0c0 .591 -.602 1.46 -1 2l-3 3h4', 'M6 10v-6l-2 2'] },
    { command: 'blockquote', label: 'Citaat', toggle: true, shortcut: { key: 'B', shift: true }, paths: ['M6 15h15', 'M21 19h-15', 'M15 11h6', 'M21 7h-6', 'M9 9h1a1 1 0 0 1 -1 1v-2.5a2 2 0 0 1 2 -2', 'M3 9h1a1 1 0 0 1 -1 1v-2.5a2 2 0 0 1 2 -2'] },
  ],
  [
    { command: 'link', label: 'Link', paths: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'] },
    { command: 'divider', label: 'Scheidingslijn', paths: ['M4 12h16'] },
    { command: 'code', label: 'Code', toggle: true, shortcut: { key: 'E' }, paths: ['M7 8l-4 4l4 4', 'M17 8l4 4l-4 4', 'M14 4l-4 16'] },
    { command: 'codeBlock', label: 'Codeblok', toggle: true, paths: ['M7 4a2 2 0 0 0 -2 2v3a2 2 0 0 1 -2 2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2', 'M17 4a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2v3a2 2 0 0 1 -2 2'] },
  ],
]

const flatButtons = computed(() => groups.flat())

// Roving index: the block dropdown is 0, the buttons follow in flat order.
const rovingIndex = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  flatButtons.value.forEach((b, i) => { map[b.command] = i + 1 })
  return map
})

// macOS shows ⌘; everywhere else Ctrl. Computed once for the tooltips.
const isMac = navigator.platform.toUpperCase().includes('MAC')
function buttonTitle(button: Btn): string {
  if (!button.shortcut) return button.label
  return `${button.label} (${formatShortcut(button.shortcut.key, button.shortcut.shift ?? false, isMac)})`
}

// Block-style dropdown options: paragraph + each heading level. With a single
// level the field offers one generic "Koptekst"; with several, numbered "Kop N".
const blockOptions = computed(() => {
  const single = props.headingLevels.length === 1
  return [
    { value: null as number | null, label: 'Paragraaf', marker: 'P' },
    ...props.headingLevels.map((level) => ({
      value: level as number | null,
      label: single ? 'Koptekst' : `Kop ${level}`,
      marker: single ? 'H' : `H${level}`,
    })),
  ]
})
const currentBlock = computed(() => blockOptions.value.find((o) => o.value === props.activeBlock) ?? blockOptions.value[0])

const menuOpen = ref(false)
const blockButton = ref<HTMLButtonElement | null>(null)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) {
    nextTick(() => {
      // Scope to this toolbar's own menu, so multiple editors on a page don't
      // steal each other's focus.
      const root = blockButton.value?.parentElement
      const active = root?.querySelector<HTMLButtonElement>('.markdown-toolbar__menuitem.is-active')
      ;(active ?? root?.querySelector<HTMLButtonElement>('.markdown-toolbar__menuitem'))?.focus()
    })
  }
}

function pickBlock(level: number | null) {
  emit('heading', level)
  menuOpen.value = false
  nextTick(() => blockButton.value?.focus())
}

function onBlockFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next)) menuOpen.value = false
}

function onMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    menuOpen.value = false
    blockButton.value?.focus()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.markdown-toolbar__menuitem'))
  const idx = items.indexOf(document.activeElement as HTMLButtonElement)
  const last = items.length - 1
  const next = event.key === 'ArrowDown' ? (idx === last ? 0 : idx + 1) : (idx <= 0 ? last : idx - 1)
  items[next]?.focus()
}

const activeIndex = ref(0)

function onKeydown(event: KeyboardEvent) {
  // The popup menu handles its own keys.
  if ((event.target as HTMLElement).closest('.markdown-toolbar__menu')) return
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const controls = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.markdown-toolbar__control'))
  const last = controls.length - 1
  let next = activeIndex.value
  if (event.key === 'ArrowRight') next = activeIndex.value === last ? 0 : activeIndex.value + 1
  else if (event.key === 'ArrowLeft') next = activeIndex.value === 0 ? last : activeIndex.value - 1
  else if (event.key === 'Home') next = 0
  else next = last
  activeIndex.value = next
  controls[next].focus()
}
</script>

<template>
  <div class="markdown-toolbar" role="toolbar" aria-label="Tekstopmaak" @keydown="onKeydown">
    <div class="markdown-toolbar__block" @focusout="onBlockFocusout">
      <button ref="blockButton" type="button"
        class="markdown-toolbar__control markdown-toolbar__block-button"
        :tabindex="activeIndex === 0 ? 0 : -1"
        aria-label="Blokstijl" title="Blokstijl" :aria-expanded="menuOpen" aria-haspopup="menu"
        @click="toggleMenu" @focus="activeIndex = 0">
        <span class="markdown-toolbar__block-marker" aria-hidden="true">{{ currentBlock.marker }}</span>
        <span class="markdown-toolbar__block-label">{{ currentBlock.label }}</span>
        <svg class="markdown-toolbar__caret" viewBox="0 0 24 24" width="14" height="14"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </button>
      <div v-if="menuOpen" class="markdown-toolbar__menu" role="menu" aria-label="Blokstijl" @keydown="onMenuKeydown">
        <button v-for="opt in blockOptions" :key="opt.label" type="button" role="menuitem" tabindex="-1"
          class="markdown-toolbar__menuitem" :class="{ 'is-active': opt.value === activeBlock }"
          @mousedown.prevent @click="pickBlock(opt.value)">
          <span class="markdown-toolbar__block-marker" aria-hidden="true">{{ opt.marker }}</span>
          <span class="markdown-toolbar__menuitem-label">{{ opt.label }}</span>
          <svg v-if="opt.value === activeBlock" class="markdown-toolbar__check" viewBox="0 0 24 24" width="16" height="16"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12l5 5l10 -10" />
          </svg>
        </button>
      </div>
    </div>

    <template v-for="(group, gi) in groups" :key="gi">
      <span class="markdown-toolbar__sep" role="separator" aria-orientation="vertical"></span>
      <button v-for="button in group" :key="button.command" type="button"
        class="markdown-toolbar__control markdown-toolbar__button"
        :class="{ 'is-active': activeMarks[button.command] }"
        :tabindex="rovingIndex[button.command] === activeIndex ? 0 : -1"
        :aria-label="button.label" :title="buttonTitle(button)"
        :aria-pressed="button.toggle ? Boolean(activeMarks[button.command]) : undefined"
        @mousedown.prevent
        @click="emit('command', button.command)"
        @focus="activeIndex = rovingIndex[button.command]">
        <svg class="markdown-toolbar__icon" viewBox="0 0 24 24" width="18" height="18"
          fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-for="(d, i) in button.paths" :key="i" :d="d" />
        </svg>
      </button>
    </template>
  </div>
</template>

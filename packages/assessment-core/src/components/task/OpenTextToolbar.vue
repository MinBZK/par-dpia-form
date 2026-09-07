<!--
  Formatting toolbar for an open text field.

  Follows the design system's own "text editor with toolbar" pattern:
  nldd-segmented-control for the groups that belong together (the emphasis
  marks, the list types), a labelled nldd-toolbar-item per group, and
  nldd-menu-group in the overflow so the groups survive the collapse instead of
  scattering into loose items. That also settles the pressed state: a segmented
  control paints selection itself, so there is no aria-pressed to work around.

  The editor is headless. Every command is a public method (toggleBold, setList,
  setHeading) and nldd-text-editor-state reports the formats at the caret, which
  is what drives the controls. Two-way, no editor internals.

  The set stays small on purpose: these are DPIA answers, not documents. Two
  heading levels, the common marks, two list types, a quote and a link. Anything
  rarer is still typed as markdown by hand, which keeps working.
-->
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import '@nldd/design-system/button'
import '@nldd/design-system/menu'
import '@nldd/design-system/segmented-control'
import '@nldd/design-system/toggle-button'
import '@nldd/design-system/toolbar'

/** The slice of nldd-text-editor this toolbar drives. */
type TextEditorElement = HTMLElement & {
  toggleBold?: () => void
  toggleItalic?: () => void
  toggleStrikethrough?: () => void
  setList?: (type: 'none' | 'bullet' | 'ordered') => void
  setHeading?: (level: number) => void
  toggleQuote?: () => void
  toggleLink?: (href?: string) => void
  getState?: () => { active: Record<string, boolean | number> }
  /** CodeMirror's view, for placing the caret after an inline command. */
  view?: {
    state: {
      selection: { main: { to: number } }
      doc: {
        lineAt: (pos: number) => { to: number }
        sliceString: (from: number, to: number) => string
      }
    }
    dispatch: (spec: { selection: { anchor: number } }) => void
  }
}

const props = defineProps<{
  editor: TextEditorElement | null
  /** Names the field this toolbar belongs to, for assistive tech. */
  accessibleLabel: string
}>()

// The formats at the caret, read off the element rather than tracked here: the
// same formats can be switched on by typing markdown, which never passes
// through this component.
const active = ref<Record<string, boolean | number>>({})

function readState() {
  active.value = props.editor?.getState?.()?.active ?? {}
}

const onStateChange = () => readState()

// The editor element is owned by the parent, so it arrives after this mounts.
watch(() => props.editor, (editor, previous) => {
  previous?.removeEventListener('nldd-text-editor-state', onStateChange)
  editor?.addEventListener('nldd-text-editor-state', onStateChange)
  readState()
}, { immediate: true })

onBeforeUnmount(() => {
  props.editor?.removeEventListener('nldd-text-editor-state', onStateChange)
})

/**
 * Put the caret past the markers an inline command just added.
 *
 * The design system's toggleBold and friends leave the selection on the wrapped
 * text, inside the new markers. The next keystroke then replaces it: type Enter
 * after bolding "woord" and the document is left as `**\n**`, the word gone.
 * Collapsing alone is not enough either — a caret between the text and its
 * closing `**` breaks the mark open on the next Enter.
 *
 * Reported to the NLDD team; see docs/nldd-feedback.md.
 */
function collapseSelection() {
  const view = props.editor?.view
  if (!view) return
  const { to } = view.state.selection.main
  const line = view.state.doc.lineAt(to)
  // Step over a run of closing marker characters directly after the selection.
  let anchor = to
  while (anchor < line.to && '*~`_'.includes(view.state.doc.sliceString(anchor, anchor + 1))) {
    anchor += 1
  }
  view.dispatch({ selection: { anchor } })
}

const MARKS = [
  { value: 'bold', text: 'Vet', icon: 'bold' },
  { value: 'italic', text: 'Cursief', icon: 'italic' },
  { value: 'strikethrough', text: 'Doorhalen', icon: 'strikethrough' },
]

// Commands are called *on* the element, never as a detached reference: they are
// class methods, so a bare `props.editor?.toggleBold` loses its `this` and
// fails silently.
const MARK_COMMANDS: Record<string, () => void> = {
  bold: () => props.editor?.toggleBold?.(),
  italic: () => props.editor?.toggleItalic?.(),
  strikethrough: () => props.editor?.toggleStrikethrough?.(),
}

function runMark(value: string) {
  MARK_COMMANDS[value]?.()
  collapseSelection()
}

/** The marks on at the caret, in the space-separated form the control takes. */
const activeMarks = () => MARKS.filter(m => active.value[m.value]).map(m => m.value)

/**
 * A checkbox segmented control reports its whole selected set; the editor
 * toggles one mark at a time. The difference against what was already active
 * says which one the user pressed.
 */
function handleMarks(event: Event) {
  const values = (event as CustomEvent<{ values?: string[] }>).detail?.values ?? []
  const before = activeMarks()
  const changed = MARKS.map(m => m.value)
    .find(v => values.includes(v) !== before.includes(v))
  if (changed) runMark(changed)
}

/**
 * The two list types, without the design system story's third "no list" option.
 *
 * A radio group needs somewhere to put "off", and the story spends a button on
 * it — but that button is then permanently selected on ordinary text, so the
 * loudest thing in the bar marks the absence of formatting. Pressing the active
 * type strips the list instead, which is what the same button does everywhere
 * else and what the checkbox group above already does.
 */
const LISTS = [
  { value: 'bullet', text: 'Opsomming', icon: 'bullet-list' },
  { value: 'ordered', text: 'Genummerd', icon: 'numbered-list' },
]

const activeList = () =>
  active.value.bulletList ? 'bullet' : active.value.orderedList ? 'ordered' : ''

const listValues = () => (activeList() ? [activeList()] : [])

// setList over toggleBulletList: bullet <-> ordered converts in one step
// instead of nesting one list inside the other.
const setList = (value: 'none' | 'bullet' | 'ordered') => props.editor?.setList?.(value)

/** Pressing the type that is already on strips the list. */
const toggleList = (value: string) =>
  setList(activeList() === value ? 'none' : (value as 'bullet' | 'ordered'))


/**
 * The editor owns the list state, not the control.
 *
 * A checkbox segmented control tracks its own selected set, and only one list
 * type can be on at a time, so that set drifts: switching bullet -> ordered
 * leaves the editor on ordered while the control still counts bullet as
 * selected. The value the editor does not already have on is therefore the one
 * just pressed; `.values` below binds the editor's answer straight back, which
 * corrects the drift on the next render.
 */
function handleList(event: Event) {
  const values = (event as CustomEvent<{ values?: string[] }>).detail?.values ?? []
  const added = values.find(v => v !== activeList())
  setList(added ? (added as 'bullet' | 'ordered') : 'none')
}

// Two levels, not six: an answer to one question does not need a document
// outline, and a picker of seven entries costs more than it gives.
const HEADINGS = [
  { level: 0, text: 'Gewone tekst' },
  { level: 2, text: 'Kop' },
  { level: 3, text: 'Subkop' },
]

const headingLevel = () => Number(active.value.heading ?? 0)

const headingText = () =>
  HEADINGS.find(h => h.level === headingLevel())?.text ?? 'Gewone tekst'

// setHeading over toggleHeading: picking the level you are already on should
// leave it there rather than strip it.
const setHeading = (level: number) => props.editor?.setHeading?.(level)

const toggleQuote = () => props.editor?.toggleQuote?.()
const toggleLink = () => props.editor?.toggleLink?.()
</script>

<template>
  <nldd-toolbar size="sm" :label="accessibleLabel">
    <!-- A lower priority overflows first, so the heading picker carries the
         highest: it is the one control that also *reads* the current block
         style, which is worth keeping visible longest. -->
    <nldd-toolbar-item slot="start" priority="4" label="Tekststijl">
      <!-- The menu goes *inside* the button: nldd-button anchors and toggles
           whatever sits in its `popup` slot. As a sibling it renders, but
           nothing opens it. -->
      <nldd-button variant="neutral-transparent" size="sm" expandable
        popup-type="menu" :text="headingText()">
        <nldd-menu slot="popup">
          <nldd-menu-item v-for="h in HEADINGS" :key="h.level" type="radio" :text="h.text"
            :selected="headingLevel() === h.level || undefined"
            @select="setHeading(h.level)"></nldd-menu-item>
        </nldd-menu>
      </nldd-button>
      <nldd-menu-group slot="overflow" text="Tekststijl">
        <nldd-menu-item v-for="h in HEADINGS" :key="h.level" type="radio" :text="h.text"
          :selected="headingLevel() === h.level || undefined"
          @select="setHeading(h.level)"></nldd-menu-item>
      </nldd-menu-group>
    </nldd-toolbar-item>

    <nldd-toolbar-item slot="start" priority="3" label="Nadruk">
      <nldd-segmented-control type="checkbox" variant="icon" size="sm"
        accessible-label="Nadruk" :values.prop="activeMarks()" @change="handleMarks">
        <nldd-segmented-control-item v-for="m in MARKS" :key="m.value" :value="m.value"
          :text="m.text" :icon="m.icon"
          :selected="active[m.value] || undefined"></nldd-segmented-control-item>
      </nldd-segmented-control>
      <nldd-menu-group slot="overflow" text="Nadruk">
        <nldd-menu-item v-for="m in MARKS" :key="m.value" type="checkbox" :text="m.text"
          :icon="m.icon" :selected="active[m.value] || undefined"
          @select="runMark(m.value)"></nldd-menu-item>
      </nldd-menu-group>
    </nldd-toolbar-item>

    <nldd-toolbar-item slot="start" priority="2" label="Lijst">
      <!-- .values is a property binding by contract (it never reflects to an
           attribute), and it is what keeps the control showing the editor's
           state rather than its own tally. -->
      <nldd-segmented-control type="checkbox" variant="icon" size="sm"
        accessible-label="Lijst" :values.prop="listValues()" @change="handleList">
        <nldd-segmented-control-item v-for="l in LISTS" :key="l.value" :value="l.value"
          :text="l.text" :icon="l.icon"
          :selected="activeList() === l.value || undefined"></nldd-segmented-control-item>
      </nldd-segmented-control>
      <nldd-menu-group slot="overflow" text="Lijst">
        <nldd-menu-item v-for="l in LISTS" :key="l.value" type="checkbox" :text="l.text"
          :icon="l.icon" :selected="activeList() === l.value || undefined"
          @select="toggleList(l.value)"></nldd-menu-item>
      </nldd-menu-group>
    </nldd-toolbar-item>

    <nldd-toolbar-item slot="start" priority="1" label="Citaat">
      <nldd-toggle-button type="button" variant="icon" size="sm" icon="text-quote"
        accessible-label="Citaat" :selected="active.quote || undefined"
        @change="toggleQuote"></nldd-toggle-button>
      <nldd-menu-item slot="overflow" type="checkbox" text="Citaat" icon="text-quote"
        :selected="active.quote || undefined" @select="toggleQuote"></nldd-menu-item>
    </nldd-toolbar-item>

    <nldd-toolbar-item slot="start" priority="1" label="Link">
      <nldd-toggle-button type="button" variant="icon" size="sm" icon="link"
        accessible-label="Link" :selected="active.link || undefined"
        @change="toggleLink"></nldd-toggle-button>
      <nldd-menu-item slot="overflow" type="checkbox" text="Link" icon="link"
        :selected="active.link || undefined" @select="toggleLink"></nldd-menu-item>
    </nldd-toolbar-item>
  </nldd-toolbar>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension, textblockTypeInputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { Markdown } from '@tiptap/markdown'
import type { EditorState } from '@tiptap/pm/state'
import { type MarkdownCommand } from '../../utils/markdownCommands'
import { markdownLinkInputRule, openLinkOnClick, openUrlInNewTab } from '../../utils/markdownLinkRule'
import MarkdownToolbar from './MarkdownToolbar.vue'

// WYSIWYG editor surface for open_text fields. The text is shown in its formatted
// form while editing; markdown stays the canonical storage format, serialized on
// every change. This keeps the stable modelValue contract, so call sites
// (FormField) and the version-history/diff/export pipeline are unchanged.
//
// Dropcursor and gapcursor are disabled because they inject a runtime <style>
// element (via style-mod), which the strict production CSP (style-src 'self')
// forbids. injectCSS:false does the same for TipTap's own base CSS. All editor
// CSS lives in base.css, keeping the editor CSP-clean and offline-friendly.
const props = defineProps<{
  modelValue: string
  inputId?: string
  ariaLabelledby?: string
  // A direct accessible name, for hosts without a separate visible label element
  // to point at via ariaLabelledby.
  ariaLabel?: string
  // Heading levels offered in the block dropdown. Default is the full range H1..H6;
  // a host can restrict it — e.g. a single level for a simple answer field, which
  // shows one generic "Koptekst" instead of numbered levels.
  headingLevels?: number[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// 1..6 matches TipTap's Level union without importing the heading extension type.
type Level = 1 | 2 | 3 | 4 | 5 | 6
const headingLevels = (props.headingLevels ?? [1, 2, 3, 4, 5, 6]) as Level[]
const minLevel = headingLevels[0]
const maxLevel = headingLevels[headingLevels.length - 1]

// Input rules: typed `[text](url)` becomes a link, and a `#`..`######` shortcut
// becomes a heading clamped into the offered range — for the full range one hash =
// H1..six = H6, and for a single-level field any number of hashes is that level.
const MarkdownInputRules = Extension.create({
  name: 'markdownInputRules',
  addInputRules() {
    return [
      markdownLinkInputRule(this.editor.schema.marks.link),
      textblockTypeInputRule({
        find: /^(#{1,6})\s$/,
        type: this.editor.schema.nodes.heading,
        getAttributes: (match) => ({ level: Math.min(Math.max(match[1].length, minLevel), maxLevel) }),
      }),
    ]
  },
})

const editor = useEditor({
  content: props.modelValue,
  contentType: 'markdown',
  injectCSS: false,
  extensions: [
    StarterKit.configure({
      dropcursor: false,
      gapcursor: false,
      heading: { levels: headingLevels },
      link: { openOnClick: false },
    }),
    Highlight,
    Markdown,
    MarkdownInputRules,
  ],
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      class: 'markdown-editor__prosemirror',
      ...(props.inputId ? { id: props.inputId } : {}),
      ...(props.ariaLabelledby ? { 'aria-labelledby': props.ariaLabelledby } : {}),
      ...(props.ariaLabel ? { 'aria-label': props.ariaLabel } : {}),
    },
    // Clicking a link opens it (foreground for a plain click) instead of moving
    // the cursor; the logic lives in openLinkOnClick.
    handleClick: (_view, _pos, event) => openLinkOnClick(event as MouseEvent),
    // Cmd/Ctrl+K opens the inline link editor (add a new link or edit the one at
    // the cursor), matching the common editor shortcut.
    handleKeyDown: (_view, event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openLinkEditor()
        return true
      }
      return false
    },
    // Pasting a URL over a non-empty selection links that text instead of
    // replacing it with the raw URL.
    handlePaste: (view, event) => {
      const text = event.clipboardData?.getData('text/plain')?.trim()
      if (text && !view.state.selection.empty && /^https?:\/\/\S+$/i.test(text)) {
        // The editor exists while the user is pasting into it.
        editor.value!.chain().focus().setLink({ href: text }).run()
        return true
      }
      return false
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getMarkdown())
    syncActiveState()
  },
  onSelectionUpdate: syncActiveState,
})

// The toolbar reflects the block + marks at the cursor: the dropdown shows the
// block type (paragraph or heading level) and each format button lights up when
// its mark/node is active. Tracked explicitly off the editor's own events rather
// than render-time reactivity, so it stays correct as the cursor moves.
const activeBlock = ref<number | null>(null)
const activeMarks = ref<Record<string, boolean>>({})
function syncActiveState() {
  const instance = editor.value
  /* istanbul ignore if @preserve -- only invoked from the editor's own events, after creation. */
  if (!instance) return
  activeBlock.value = instance.isActive('heading') ? (instance.getAttributes('heading').level as number) : null
  activeMarks.value = {
    bold: instance.isActive('bold'),
    italic: instance.isActive('italic'),
    underline: instance.isActive('underline'),
    strikethrough: instance.isActive('strike'),
    highlight: instance.isActive('highlight'),
    bulletList: instance.isActive('bulletList'),
    orderedList: instance.isActive('orderedList'),
    blockquote: instance.isActive('blockquote'),
    link: instance.isActive('link'),
  }
}

// Apply external value changes (e.g. reference prefill) without clobbering what
// the user is typing — only re-set when the incoming markdown actually differs.
watch(() => props.modelValue, (value) => {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the editor is created on mount, before any
     external modelValue change can arrive. */
  if (!instance) return
  if (value !== instance.getMarkdown()) {
    instance.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }
})

// Inline link editor (replaces a window.prompt). Opening it shows a URL field in
// the field's footer area; when the cursor is on a link it is pre-filled and can
// be opened or removed, otherwise it adds a new link to the selection.
const linkEditorOpen = ref(false)
const editingExistingLink = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

function openLinkEditor() {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the toolbar is only interactive once mounted. */
  if (!instance) return
  const href = instance.getAttributes('link').href as string | undefined
  editingExistingLink.value = Boolean(href)
  linkUrl.value = href ?? ''
  linkEditorOpen.value = true
  nextTick(() => {
    /* istanbul ignore else @preserve -- the input renders whenever the link bar is open. */
    if (linkInput.value) linkInput.value.focus()
  })
}

// The non-whitespace range around the cursor (the "word"), or null when the
// cursor sits in whitespace. Lets a link with no selection attach to the word the
// caret is in instead of inserting a bare URL.
function wordRangeAt(state: EditorState): { from: number; to: number } | null {
  const { $from } = state.selection
  const text = $from.parent.textContent
  const offset = $from.parentOffset
  let start = offset
  let end = offset
  while (start > 0 && /\S/.test(text[start - 1])) start--
  while (end < text.length && /\S/.test(text[end])) end++
  if (start === end) return null
  const base = $from.pos - offset
  return { from: base + start, to: base + end }
}

function applyLink() {
  const instance = editor.value
  /* istanbul ignore else @preserve -- the editor stays mounted while the link bar is open. */
  if (instance) {
    const url = linkUrl.value.trim()
    if (!url) {
      instance.chain().focus().extendMarkRange('link').unsetLink().run()
    } else if (instance.state.selection.empty && !instance.isActive('link')) {
      const word = wordRangeAt(instance.state)
      if (word) {
        // Cursor inside a word: turn that whole word into the link.
        instance.chain().focus().setTextSelection(word).setLink({ href: url }).run()
      } else {
        // Cursor in empty space: insert the URL as the visible, clickable link
        // text. (setLink on an empty selection only sets a stored mark, so
        // nothing would appear.)
        instance.chain().focus().insertContent({
          type: 'text',
          text: url,
          marks: [{ type: 'link', attrs: { href: url } }],
        }).run()
      }
    } else {
      // Text is selected, or the cursor is on an existing link: apply/update the
      // link mark over that range.
      instance.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }
  linkEditorOpen.value = false
}

function openLink() {
  const url = linkUrl.value.trim()
  if (/^https?:\/\//i.test(url)) {
    openUrlInNewTab(url)
  } else if (/^mailto:/i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function removeLink() {
  const instance = editor.value
  /* istanbul ignore else @preserve -- the editor stays mounted while the link bar is open. */
  if (instance) instance.chain().focus().extendMarkRange('link').unsetLink().run()
  linkEditorOpen.value = false
}

function cancelLink() {
  linkEditorOpen.value = false
  const instance = editor.value
  /* istanbul ignore else @preserve -- the editor stays mounted while the link bar is open. */
  if (instance) instance.chain().focus().run()
}

function handleCommand(command: MarkdownCommand) {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the toolbar is only interactive once mounted. */
  if (!instance) return

  switch (command) {
    case 'bold':
      instance.chain().focus().toggleBold().run()
      break
    case 'italic':
      instance.chain().focus().toggleItalic().run()
      break
    case 'underline':
      instance.chain().focus().toggleUnderline().run()
      break
    case 'strikethrough':
      instance.chain().focus().toggleStrike().run()
      break
    case 'bulletList':
      instance.chain().focus().toggleBulletList().run()
      break
    case 'orderedList':
      instance.chain().focus().toggleOrderedList().run()
      break
    case 'blockquote':
      instance.chain().focus().toggleBlockquote().run()
      break
    case 'highlight':
      instance.chain().focus().toggleHighlight().run()
      break
    case 'divider':
      instance.chain().focus().setHorizontalRule().run()
      break
    case 'link':
      openLinkEditor()
      break
  }
}

// Apply a heading level from the toolbar dropdown; null turns the block back into
// a paragraph.
function setHeading(level: number | null) {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the toolbar is only interactive once mounted. */
  if (!instance) return
  if (level === null) {
    instance.chain().focus().setParagraph().run()
  } else {
    instance.chain().focus().setHeading({ level: level as Level }).run()
  }
}

// Exposed for tests that need to drive the editor selection directly.
defineExpose({ editor })
</script>

<template>
  <div class="markdown-editor rvo-margin-block-end--md">
    <EditorContent class="markdown-editor__content" :editor="editor" />

    <div v-if="linkEditorOpen" class="markdown-editor__linkbar">
      <form class="markdown-editor__linkform" @submit.prevent="applyLink">
        <input ref="linkInput" v-model="linkUrl" type="url" aria-label="Link-URL"
          class="utrecht-textbox utrecht-textbox--html-input markdown-editor__linkinput"
          placeholder="https://" @keydown.esc.prevent="cancelLink" />
        <button type="submit"
          class="rvo-button rvo-button--primary rvo-button--size-xs">{{ editingExistingLink ? 'Opslaan' : 'Toevoegen' }}</button>
        <button v-if="editingExistingLink" type="button" @click="openLink"
          class="rvo-button rvo-button--secondary rvo-button--size-xs">Openen</button>
        <button v-if="editingExistingLink" type="button" @click="removeLink"
          class="rvo-button rvo-button--secondary rvo-button--size-xs">Verwijderen</button>
        <button type="button" @click="cancelLink"
          class="rvo-button rvo-button--secondary rvo-button--size-xs">Annuleren</button>
      </form>
    </div>

    <div class="markdown-editor__footer">
      <MarkdownToolbar :heading-levels="headingLevels" :active-block="activeBlock" :active-marks="activeMarks"
        @command="handleCommand" @heading="setHeading" />
    </div>
  </div>
</template>

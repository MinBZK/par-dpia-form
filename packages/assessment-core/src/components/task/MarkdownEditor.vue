<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { type MarkdownCommand } from '../../utils/markdownCommands'
import { markdownLinkInputRule } from '../../utils/markdownLinkRule'
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
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Turn the typed markdown link syntax `[text](url)` into a real link.
const MarkdownLinkRule = Extension.create({
  name: 'markdownLinkRule',
  addInputRules() {
    return [markdownLinkInputRule(this.editor.schema.marks.link)]
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
      link: { openOnClick: false },
    }),
    Markdown,
    MarkdownLinkRule,
  ],
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      class: 'markdown-editor__prosemirror',
      ...(props.inputId ? { id: props.inputId } : {}),
      ...(props.ariaLabelledby ? { 'aria-labelledby': props.ariaLabelledby } : {}),
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getMarkdown())
  },
})

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
// the field's footer area; submitting applies the link to the current selection.
const linkEditorOpen = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement | null>(null)

function openLinkEditor() {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the toolbar is only interactive once mounted. */
  if (!instance) return
  linkUrl.value = ''
  linkEditorOpen.value = true
  nextTick(() => {
    /* istanbul ignore else @preserve -- the input renders whenever the link bar is open. */
    if (linkInput.value) linkInput.value.focus()
  })
}

function applyLink() {
  const instance = editor.value
  /* istanbul ignore else @preserve -- the editor stays mounted while the link bar is open. */
  if (instance) {
    const url = linkUrl.value.trim()
    const chain = instance.chain().focus().extendMarkRange('link')
    if (url) {
      chain.setLink({ href: url }).run()
    } else {
      chain.unsetLink().run()
    }
  }
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
    case 'heading':
      // H1/H2 are the document and section levels, so a heading inside a field
      // is a sub-heading: H3.
      instance.chain().focus().toggleHeading({ level: 3 }).run()
      break
    case 'bulletList':
      instance.chain().focus().toggleBulletList().run()
      break
    case 'orderedList':
      instance.chain().focus().toggleOrderedList().run()
      break
    case 'link':
      openLinkEditor()
      break
  }
}
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
          class="utrecht-button utrecht-button--primary-action utrecht-button--rvo-xs">Toevoegen</button>
        <button type="button" @click="cancelLink"
          class="utrecht-button utrecht-button--secondary-action utrecht-button--rvo-xs">Annuleren</button>
      </form>
    </div>

    <div class="markdown-editor__footer">
      <MarkdownToolbar @command="handleCommand" />
    </div>
  </div>
</template>

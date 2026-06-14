<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { type MarkdownCommand } from '../../utils/markdownCommands'
import MarkdownToolbar from './MarkdownToolbar.vue'

// WYSIWYG editor surface for open_text fields. The text is shown in its formatted
// form while editing (no read/edit toggle); markdown stays the canonical storage
// format, serialized on every change. This keeps the stable modelValue contract,
// so call sites (FormField) and the version-history/diff/export pipeline are
// unchanged.
//
// Dropcursor and gapcursor are disabled because they inject a runtime <style>
// element (via style-mod), which the strict production CSP (style-src 'self')
// forbids. All editor CSS lives in base.css instead, keeping the editor
// CSP-clean and offline-single-file friendly.
const props = defineProps<{
  modelValue: string
  inputId?: string
  ariaLabelledby?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editor = useEditor({
  content: props.modelValue,
  contentType: 'markdown',
  // Do not let TipTap inject its base CSS as a runtime <style> element: that
  // would violate the strict production CSP (style-src 'self'). The equivalent
  // rules live in base.css instead.
  injectCSS: false,
  extensions: [
    StarterKit.configure({
      dropcursor: false,
      gapcursor: false,
      link: { openOnClick: false },
    }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      class: 'markdown-editor__content',
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

function handleCommand(command: MarkdownCommand) {
  const instance = editor.value
  /* istanbul ignore if @preserve -- the toolbar is only interactive once the
     editor is mounted. */
  if (!instance) return

  switch (command) {
    case 'bold':
      instance.chain().focus().toggleBold().run()
      break
    case 'italic':
      instance.chain().focus().toggleItalic().run()
      break
    case 'heading':
      instance.chain().focus().toggleHeading({ level: 2 }).run()
      break
    case 'bulletList':
      instance.chain().focus().toggleBulletList().run()
      break
    case 'orderedList':
      instance.chain().focus().toggleOrderedList().run()
      break
    case 'link': {
      const url = window.prompt('Voer de URL in:', 'https://')
      if (url) {
        instance.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
      }
      break
    }
  }
}
</script>

<template>
  <div class="open-text-field rvo-margin-block-end--md">
    <div class="open-text-field__header">
      <MarkdownToolbar @command="handleCommand" />
    </div>
    <EditorContent class="markdown-editor" :editor="editor" />
  </div>
</template>

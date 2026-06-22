import { InputRule } from '@tiptap/core'
import type { MarkType } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

// Input rule so typing the markdown link syntax `[text](url)` turns into a real
// link as you type. TipTap's markInputRule cannot be reused here: it keeps the
// LAST capture group (the url) as the visible text, while a markdown link shows
// the FIRST group (the text). So we apply the replacement ourselves.

// Matches a completed `[text](url)` at the end of the input. The url may not
// contain whitespace or a closing paren.
export const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^\s)]+)\)$/

// Replace the matched range with `text`, marked as a link to `href`.
export function applyMarkdownLink(
  tr: Transaction,
  link: MarkType,
  from: number,
  to: number,
  text: string,
  href: string,
): void {
  tr.insertText(text, from, to)
  tr.addMark(from, from + text.length, link.create({ href }))
  tr.removeStoredMark(link)
}

export function markdownLinkInputRule(link: MarkType): InputRule {
  return new InputRule({
    find: MARKDOWN_LINK_PATTERN,
    handler: ({ state, range, match }) =>
      applyMarkdownLink(state.tr, link, range.from, range.to, match[1], match[2]),
  })
}

// Open a URL in a new FOREGROUND tab. A programmatic window.open inherits the
// triggering gesture's modifier keys, so a Cmd/Ctrl+click would open the tab in
// the background (and window.focus() cannot steal focus back). A synthetic anchor
// click carries no modifiers, so the browser opens it in the foreground;
// rel="noopener" severs window.opener (reverse tabnabbing). Callers pass an
// already-validated http(s) URL.
export function openUrlInNewTab(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.click()
}

// While editing, a plain click on a link just places the cursor. Holding the
// platform modifier (Cmd on macOS, Ctrl elsewhere) opens the link in a focused
// new tab, matching common editors. Used as a ProseMirror handleClick: it
// preventDefaults the native handling and returns true so the editor does not
// also move the selection (which would otherwise select the clicked line).
// Returns false (lets the editor place the cursor) for a plain click or a
// non-openable link. Only http(s) is opened, blocking javascript:/data: hidden
// in link markdown.
export function openLinkOnModifierClick(event: MouseEvent): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false
  const anchor = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
  if (!anchor || !/^https?:\/\//i.test(anchor.href)) return false
  event.preventDefault()
  openUrlInNewTab(anchor.href)
  return true
}

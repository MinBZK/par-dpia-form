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

// While editing, a plain click on a link just places the cursor. Holding the
// platform modifier (Cmd on macOS, Ctrl elsewhere) opens the link in a new tab,
// matching common editors. Used as a ProseMirror handleClick: it preventDefaults
// the native handling and returns true so the editor does not also move the
// selection (which would otherwise select the clicked line). Returns false (lets
// the editor place the cursor) for a plain click or a non-openable link.
//
// Security: only http(s) hrefs are opened, blocking javascript:/data: that could
// hide in user-entered link markdown. noopener,noreferrer severs window.opener so
// the opened page cannot navigate this tab back to a phishing page (reverse
// tabnabbing). A programmatic window.open already lands in the foreground, so no
// .focus() is needed (and noopener makes the return value null anyway).
export function openLinkOnModifierClick(event: MouseEvent): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false
  const anchor = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
  if (!anchor || !/^https?:\/\//i.test(anchor.href)) return false
  event.preventDefault()
  window.open(anchor.href, '_blank', 'noopener,noreferrer')
  return true
}

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
// matching common editors. Returns true when a link was opened.
export function openLinkOnModifierClick(event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null
  const anchor = target?.closest('a') as HTMLAnchorElement | null
  if (anchor && (event.metaKey || event.ctrlKey)) {
    window.open(anchor.href, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}

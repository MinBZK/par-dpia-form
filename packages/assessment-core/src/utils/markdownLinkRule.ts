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

// Normalise what the user typed into a usable href:
// - already has a scheme (http:, https:, mailto:, ...) → left as-is (the renderer's
//   allowlist still strips unsupported schemes such as javascript:),
// - a bare email address (foo@bar.nl) → gets a `mailto:` scheme,
// - anything else (google.com, www.x.nl) → defaults to `https://`.
export function normalizeLinkHref(input: string): string {
  const url = input.trim()
  if (!url) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`
  return `https://${url}`
}

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
      applyMarkdownLink(state.tr, link, range.from, range.to, match[1], normalizeLinkHref(match[2])),
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

// Open an already-normalised link: http(s) in a foreground tab, mailto via the OS
// mail handler. Returns whether it opened anything (false for any other scheme).
export function openLinkUrl(url: string): boolean {
  if (/^https?:\/\//i.test(url)) {
    openUrlInNewTab(url)
    return true
  }
  if (/^mailto:/i.test(url)) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  }
  return false
}

// Clicking a link opens it (Obsidian-style), rather than placing the cursor. A
// plain click opens in the foreground; a Cmd/Ctrl+click opens in the background
// (the browser applies the held modifier — see openUrlInNewTab). Used as a
// ProseMirror handleClick: it preventDefaults the cursor placement and returns
// true when it handled a link click, and false (let the editor place the cursor)
// for any other click. Only http(s) and mailto: are opened, blocking
// javascript:/data: hidden in link markdown. To put the cursor inside a link for
// editing, drag-select it.
export function openLinkOnClick(event: MouseEvent): boolean {
  const anchor = (event.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
  if (!anchor || !/^(https?:|mailto:)/i.test(anchor.href)) return false
  event.preventDefault()
  return openLinkUrl(anchor.href)
}

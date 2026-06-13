// Markdown formatting commands for the open_text editor toolbar.
//
// These are pure functions: given the current text and selection, they return
// the new text and selection. Keeping the logic outside any component means it
// is reused unchanged across editor surfaces (a textarea today, a richer editor
// later) and is fully unit-testable without a DOM.

export interface EditorSelection {
  text: string
  selectionStart: number
  selectionEnd: number
}

export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'link'

interface LinePrefixSpec {
  // Prefix inserted when toggling the construct on.
  add: string
  // Matches an existing prefix (anchored at line start) when toggling off.
  match: RegExp
}

// Wrap the selection with a marker, or remove it when already wrapped.
function toggleInlineWrap(sel: EditorSelection, marker: string): EditorSelection {
  const { text, selectionStart: start, selectionEnd: end } = sel
  const len = marker.length

  if (text.slice(start - len, start) === marker && text.slice(end, end + len) === marker) {
    return {
      text: text.slice(0, start - len) + text.slice(start, end) + text.slice(end + len),
      selectionStart: start - len,
      selectionEnd: end - len,
    }
  }

  const selected = text.slice(start, end)
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selectionStart: start + len,
    selectionEnd: end + len,
  }
}

// Toggle a line-level prefix (heading, list) on every line the selection spans.
// When all spanned lines already carry the prefix it is removed; otherwise the
// prefix is added to the lines that lack it.
function toggleLinePrefix(sel: EditorSelection, spec: LinePrefixSpec): EditorSelection {
  const { text, selectionStart: start, selectionEnd: end } = sel
  const blockStart = text.lastIndexOf('\n', start - 1) + 1
  const newlineAfter = text.indexOf('\n', end)
  const blockEnd = newlineAfter === -1 ? text.length : newlineAfter

  const lines = text.slice(blockStart, blockEnd).split('\n')
  const allPrefixed = lines.every((line) => spec.match.test(line))
  const newBlock = lines
    .map((line) => {
      if (allPrefixed) return line.replace(spec.match, '')
      if (spec.match.test(line)) return line
      return spec.add + line
    })
    .join('\n')

  return {
    text: text.slice(0, blockStart) + newBlock + text.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + newBlock.length,
  }
}

// Insert a markdown link around the selection (or a "tekst" placeholder) and
// place the selection on the URL so the user can type it immediately.
function insertLink(sel: EditorSelection): EditorSelection {
  const { text, selectionStart: start, selectionEnd: end } = sel
  const label = text.slice(start, end) || 'tekst'
  const inserted = `[${label}](url)`
  const urlStart = start + label.length + 3 // '[' + label + '](' === label.length + 3

  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + 3, // 'url'.length
  }
}

const COMMANDS: Record<MarkdownCommand, (sel: EditorSelection) => EditorSelection> = {
  bold: (sel) => toggleInlineWrap(sel, '**'),
  italic: (sel) => toggleInlineWrap(sel, '*'),
  heading: (sel) => toggleLinePrefix(sel, { add: '## ', match: /^#{1,6} / }),
  bulletList: (sel) => toggleLinePrefix(sel, { add: '- ', match: /^[-*] / }),
  orderedList: (sel) => toggleLinePrefix(sel, { add: '1. ', match: /^\d+\. / }),
  link: insertLink,
}

export function applyMarkdownCommand(command: MarkdownCommand, sel: EditorSelection): EditorSelection {
  return COMMANDS[command](sel)
}

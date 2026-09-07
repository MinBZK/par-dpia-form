/**
 * Taken from Waggle (https://code.overheid.nl/robbertbos/waggle), EUPL-1.2,
 * frontend/src/components/composer/nldd/. Unchanged except for this notice.
 *
 * Hide the markdown syntax markers, the way Obsidian's live preview does: gone
 * except on the construct the caret sits in, so the syntax stays editable.
 *
 * NLDD only dims the markers (`Decoration.mark({ class: 'cm-md-mark' })`) and
 * exposes no switch. A consumer `Decoration.replace` over the same range wins
 * on rendering, which is what this uses.
 *
 * `ListMark` is deliberately not hidden: NLDD renders `- ` as a styled bullet
 * dot, so hiding it removes the bullet. The exception is a task line, where the
 * dot would sit in front of the checkbox.
 */
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { type EditorState, type Extension, type Line, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import { isEditing } from './caretReveal';

/**
 * Inline syntax markers, and the node each one is only a marker *of*.
 *
 * The parent check is not decoration: `CodeMark` is also the ``` of a fenced
 * block, which is handled as a block below and must not be caught here.
 */
const INLINE_MARKS: Record<string, ReadonlySet<string>> = {
  EmphasisMark: new Set(['Emphasis', 'StrongEmphasis']),
  StrikethroughMark: new Set(['Strikethrough']),
  CodeMark: new Set(['InlineCode']),
};
const hidden = Decoration.replace({});

/** The language on the opening fence, kept as a label once the ``` is gone. */
const langMark = Decoration.mark({ class: 'cm-wg-code-lang' });

/**
 * The delimiters of a fenced block that should disappear, with the language on
 * that line if there is one.
 *
 * Per line, not per block, like every other marker in this file: the caret
 * shows the fence it stands on and leaves the other one alone. Per block would
 * expand both rows the moment the caret entered anywhere in the code, and those
 * rows carry the block's padding now (measured: a +28.8px jump on entry).
 *
 * An unclosed block keeps its fence. It has one `CodeMark`, runs to the end of
 * the document, and that ``` is the only thing saying the block is still open.
 */
function hiddenFences(state: EditorState, fence: SyntaxNode): FenceLine[] {
  const marks: SyntaxNode[] = [];
  for (let child = fence.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeMark') marks.push(child);
  }
  if (marks.length < 2) return [];

  const info = fence.getChild('CodeInfo');
  const sel = state.selection.main;
  const out: FenceLine[] = [];
  for (const mark of marks) {
    const line = state.doc.lineAt(mark.from);
    if (isEditing(sel, line.from, line.to)) continue;
    out.push({ line, mark, info: info && info.from >= line.from ? info : null });
  }
  return out;
}

type FenceLine = { line: Line; mark: SyntaxNode; info: SyntaxNode | null };

/** `[x]` / `[ ]` drawn as a real checkbox. Toggling rewrites the source char,
 *  so the markdown stays the wire format. */
class TaskBox extends WidgetType {
  // Plain fields, not parameter properties: tsconfig sets erasableSyntaxOnly.
  readonly checked: boolean;
  readonly pos: number;
  constructor(checked: boolean, pos: number) {
    super();
    this.checked = checked;
    this.pos = pos;
  }
  eq(other: TaskBox) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-task-box';
    // A raw dispatch bypasses the readOnly facet, so the widget has to honour
    // it itself - otherwise a disabled composer still ticks boxes.
    box.disabled = view.state.readOnly;
    // The widget replaces the `[ ]` in the DOM, so hiding it from assistive tech
    // would drop the task state: the source text is no longer there to read.
    // Out of the tab order because the line is edited as text.
    box.tabIndex = -1;
    box.setAttribute('aria-label', this.checked ? 'Taak afgerond' : 'Taak niet afgerond');
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' },
      });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

const taskBoxTheme = EditorView.theme({
  '.cm-task-box': {
    // The browser default is 13px, which reads small next to the editor's 18px text.
    width: 'var(--primitives-space-16)',
    height: 'var(--primitives-space-16)',
    verticalAlign: 'middle',
    margin: '0 var(--primitives-space-4) 0 0',
    accentColor: 'var(--semantics-links-color)',
    cursor: 'pointer',
  },
  // On the edited line the source comes back, so NLDD's bullet dot gives way to
  // the literal `-` it stands for; a dot plus a raw `[ ]` is neither.
  '.cm-wg-raw .cm-md-bullet': { color: 'inherit' },
  '.cm-wg-raw .cm-md-bullet::before': { display: 'none' },
  // The descendant selector is the point: NLDD's own `.cm-md-mark` sits inside
  // this one and carries the dimmed colour, so setting it on the outer span
  // alone leaves the number grey.
  '.cm-wg-ordered, .cm-wg-ordered .cm-md-mark': {
    color: 'var(--semantics-content-color)',
  },
  // The dot is a pseudo-element painted from the private `--_bullet-color`, so
  // only the colour declaration is overridden, not the token.
  // `.cm-line` in front is load-bearing: NLDD's own rule has the same
  // specificity, and stylesheet order in the shadow root is not ours to rely on.
  '.cm-line .cm-md-bullet::before': {
    backgroundColor: 'var(--semantics-content-color)',
  },
});

/** Marks the caret's line so its list marker renders as source, not as a dot. */
const rawLine = Decoration.line({ class: 'cm-wg-raw' });

/**
 * An ordered-list marker in the normal content colour: NLDD dims every syntax
 * marker, but `1.` is the list's visible numbering, and a bullet list gets a
 * full-strength dot in the same position. Colour only - the marker keeps NLDD's
 * monospace, whose fixed advance is what its hanging indent is measured in.
 */
const orderedMark = Decoration.mark({ class: 'cm-wg-ordered' });

const orderedMarkers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            if (node.name !== 'ListMark') return;
            if (!/^\d+[.)]$/.test(view.state.sliceDoc(node.from, node.to))) return;
            builder.add(node.from, node.to, orderedMark);
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

const rawCaretLine = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      const builder = new RangeSetBuilder<Decoration>();
      builder.add(line.from, line.from, rawLine);
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

type Hit = [from: number, to: number, deco: Decoration];
type LineHit = [pos: number, deco: Decoration];

/**
 * NLDD tints a fenced block's *content* lines and leaves the ``` lines clean -
 * `addFencedCodeLines` in `text-editor.markdown.js` skips every line carrying a
 * CodeMark - because there the fence is what draws the boundary. Once the
 * backticks are hidden that leaves two blank rows framing the tint, and an
 * empty block (whose only lines are fence lines) disappears altogether.
 *
 * So the surface is extended over the fence rows, in NLDD's own classes rather
 * than a copy of its private tokens: `cm-md-codeblock` carries the background,
 * the mono font and the inline padding, and `-first`/`-last` the rounded
 * corners. The content lines NLDD rounded are interior now, which is what the
 * two `cm-wg-code-inner-*` classes cancel.
 */
export function collectFenceSurface(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
): LineHit[] {
  const out: LineHit[] = [];
  const doc = state.doc;
  const seen = new Set<number>();

  for (const { from, to } of visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return;
        /* istanbul ignore next -- a fence reached twice across two visible
           ranges; the viewport is a single range in tests, so this guards a
           split viewport we cannot produce in jsdom. */
        if (seen.has(node.from)) return false;
        seen.add(node.from);

        const marks: SyntaxNode[] = [];
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === 'CodeMark') marks.push(child);
        }
        /* istanbul ignore next -- the markdown parser never emits a FencedCode
           without a CodeMark; the guard keeps marks[0] below from throwing if a
           future grammar does. */
        if (!marks.length) return false;
        const open = doc.lineAt(marks[0].from);
        const close = marks.length > 1 ? doc.lineAt(marks[marks.length - 1].from) : null;

        // Same predicate as the hiding: a revealed ``` needs the full row height.
        const slim = new Set(hiddenFences(state, node.node).map((f) => f.line.number));
        const fenceClass = (line: Line, edge: string) =>
          slim.has(line.number)
            ? `cm-md-codeblock ${edge} cm-wg-fence-slim`
            : `cm-md-codeblock ${edge}`;

        out.push([open.from, surfaceLine(fenceClass(open, 'cm-md-codeblock-first'))]);
        if (close) out.push([close.from, surfaceLine(fenceClass(close, 'cm-md-codeblock-last'))]);

        // An unclosed block runs to the end of the document, so its last line
        // is content rather than a delimiter.
        const lastContent = close ? close.number - 1 : doc.lineAt(Math.max(node.from, node.to - 1)).number;
        if (lastContent > open.number) {
          out.push([doc.line(open.number + 1).from, surfaceLine('cm-wg-code-inner-top')]);
          out.push([doc.line(lastContent).from, surfaceLine('cm-wg-code-inner-bottom')]);
        }
        return false;
      },
    });
  }

  // Ascending for RangeSetBuilder; the sort is stable, so top stays before
  // bottom where a one-line block puts both on the same position.
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

const lineDecoCache = new Map<string, Decoration>();
function surfaceLine(cls: string): Decoration {
  const cached = lineDecoCache.get(cls) ?? Decoration.line({ class: cls });
  lineDecoCache.set(cls, cached);
  return cached;
}

/**
 * Ranges to replace, collected then sorted (RangeSetBuilder demands document
 * order). Pure in the state, so it is testable without a mounted view.
 */
export function collectHiddenRanges(
  state: EditorState,
  visibleRanges: readonly { from: number; to: number }[],
): Hit[] {
  const out: Hit[] = [];
  const sel = state.selection.main;
  const tree = syntaxTree(state);
  const doc = state.doc;

  const editing = (from: number, to: number) => isEditing(sel, from, to);

  for (const { from, to } of visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        // ```` ``` ````. The walk deliberately continues into the block: a
        // quoted code block carries a QuoteMark on each of its lines, and those
        // are hidden like any other, because `quoteBar` draws the quote as a
        // bar on every line of the blockquote. Keeping them would put a `>`
        // inside the block and none on the line above it, and the code on
        // screen would stop matching the code that is sent - the parser strips
        // that prefix.
        if (node.name === 'FencedCode') {
          for (const { mark, info } of hiddenFences(state, node.node)) {
            out.push([mark.from, mark.to, hidden]);
            // Only on a line whose ``` is gone: on the revealed line the same
            // word is source, and must read as source.
            if (info) out.push([info.from, info.to, langMark]);
          }
          return;
        }

        // `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``
        const allowedParents = INLINE_MARKS[node.name];
        if (allowedParents) {
          const parent = node.node.parent;
          if (!parent || !allowedParents.has(parent.name)) return;
          if (editing(parent.from, parent.to)) return;
          out.push([node.from, node.to, hidden]);
          return;
        }

        // `[x]` / `[ ]` → a real checkbox, but only away from the caret.
        if (node.name === 'TaskMarker') {
          const line = doc.lineAt(node.from);
          if (editing(line.from, line.to)) return;
          const checked = doc.sliceString(node.from + 1, node.to - 1).toLowerCase() === 'x';
          out.push([node.from, node.to, Decoration.replace({ widget: new TaskBox(checked, node.from) })]);
          // A bullet dot in front of the checkbox reads as two bullets.
          const bullet = /^(\s*)([-*+] )/.exec(doc.sliceString(line.from, node.from));
          if (bullet) out.push([line.from + bullet[1].length, line.from + bullet[0].length, hidden]);
          return;
        }

        // `## ` and `> ` - swallow the single separating space too, otherwise
        // the line keeps a stray indent where the marker used to be.
        if (node.name === 'HeaderMark' || node.name === 'QuoteMark') {
          const line = doc.lineAt(node.from);
          if (editing(line.from, line.to)) return;
          let end = node.to;
          if (end < line.to && doc.sliceString(end, end + 1) === ' ') end += 1;
          out.push([node.from, end, hidden]);
          return;
        }

        // `[tekst](url)` → `tekst`. Hide `[` and everything from `]` to `)`.
        if (node.name === 'Link') {
          if (editing(node.from, node.to)) return;
          const marks: Array<{ from: number; to: number }> = [];
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'LinkMark') marks.push({ from: c.from, to: c.to });
          }
          /* istanbul ignore next -- a Link node always carries both its `[`
             and its `](…)` marks; the guard keeps marks[1] from throwing if a
             future grammar emits a half-parsed one. */
          if (marks.length < 2) return;
          out.push([node.from, marks[0].to, hidden]);
          out.push([marks[1].from, node.to, hidden]);
        }
      },
    });
  }

  /* istanbul ignore next -- the second comparison is a tiebreak for two ranges
     starting at the same position. The collectors emit disjoint ranges (every
     marker belongs to one construct), so it is a stable-sort guarantee rather
     than a reachable branch. */
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const [from, to, deco] of collectHiddenRanges(view.state, view.visibleRanges)) {
    /* istanbul ignore next -- RangeSetBuilder throws on an overlapping or
       empty range. The collectors do not currently produce either, so this is
       a crash guard rather than a branch: hitting it would need a marker
       nested inside another marker's range. */
    if (from < last || from === to) continue;
    builder.add(from, to, deco);
    last = to;
  }
  return builder.finish();
}

const markerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const fenceSurface = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      // selectionSet too: the slim class tracks which fence is revealed.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const [pos, deco] of collectFenceSurface(view.state, view.visibleRanges)) {
        builder.add(pos, pos, deco);
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

const codeFenceTheme = EditorView.theme({
  // The content lines NLDD rounded sit in the middle of the block now. Higher
  // specificity than NLDD's own `:host .cm-md-codeblock-first`, which ties at
  // (0,2,0) and would otherwise be settled by stylesheet order in the shadow
  // root - not ours to rely on.
  '.cm-content .cm-line.cm-wg-code-inner-top': {
    paddingTop: '0',
    borderStartStartRadius: '0',
    borderStartEndRadius: '0',
  },
  '.cm-content .cm-line.cm-wg-code-inner-bottom': {
    paddingBottom: '0',
    borderEndStartRadius: '0',
    borderEndEndRadius: '0',
  },
  // The language reads as a label, not as the first line of the code.
  '.cm-wg-code-lang': {
    fontSize: 'var(--primitives-font-size-70)',
    color: 'var(--semantics-content-secondary-color)',
  },
  // A fence row with nothing left to show is the block's padding.
  //
  // 18 is a floor: ArrowDown probes a fixed distance past the caret and steps
  // straight over a shorter row (measured: 12-13 skip three rows, 14-16 two).
  // Height only - `font-size: 0` would take NLDD's 0.3em inline padding with
  // it and put the language label 4.8px left of its code.
  '.cm-content .cm-line.cm-wg-fence-slim': {
    lineHeight: 'var(--primitives-space-18)',
    minHeight: 'var(--primitives-space-18)',
    paddingBlock: '0',
  },
});

export const hideMarkdownMarkers: Extension = [
  markerPlugin,
  fenceSurface,
  rawCaretLine,
  orderedMarkers,
  taskBoxTheme,
  codeFenceTheme,
];

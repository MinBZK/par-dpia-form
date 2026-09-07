/**
 * Taken from Waggle (https://code.overheid.nl/robbertbos/waggle), EUPL-1.2,
 * frontend/src/components/composer/nldd/hideMarkers.test.ts, alongside the
 * module it covers. Unchanged except for this notice and the import path.
 */
import { syntaxTree } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';

import { collectFenceSurface, collectHiddenRanges } from '../../src/components/task/editor/hideMarkers';

/** Same language config as nldd-text-editor uses, so the tree matches. */
function stateFor(doc: string, cursor = doc.length) {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ extensions: GFM })],
  });
}

/** The document with every hidden range removed - what the user ends up seeing. */
function visibleText(doc: string, cursor = doc.length): string {
  let out = '';
  let at = 0;
  for (const [from, to] of replacements(doc, cursor)) {
    if (from < at) continue;
    out += doc.slice(at, from);
    at = to;
  }
  return out + doc.slice(at);
}

/** Only the ranges that remove text: a decoration carrying a class styles it. */
function replacements(doc: string, cursor = doc.length): [number, number][] {
  const hits = collectHiddenRanges(stateFor(doc, cursor), [{ from: 0, to: doc.length }]);
  return hits.filter(([, , deco]) => !deco.spec.class).map(([from, to]) => [from, to]);
}

describe('collectHiddenRanges', () => {
  it('hides the emphasis markers', () => {
    expect(visibleText('een **vet** woord', 0)).toBe('een vet woord');
    expect(visibleText('een *schuin* woord', 0)).toBe('een schuin woord');
    expect(visibleText('een ~~weg~~ woord', 0)).toBe('een weg woord');
  });

  it('hides inline-code backticks', () => {
    expect(visibleText('roep `fn()` aan', 0)).toBe('roep fn() aan');
  });

  it('hides the fences and keeps the language name', () => {
    // The language name is the only trace of the language left - this editor
    // does no syntax highlighting - so it stays where the fence was.
    const doc = 'tekst\n\n```python\nprint("hi")\n```\n';
    expect(visibleText(doc, 0)).toBe('tekst\n\npython\nprint("hi")\n\n');
  });

  it('shows the fence the caret stands on, and only that one', () => {
    // Per line, like the heading and quote markers: revealing both would expand
    // two rows at once, and those rows are the block's padding.
    const doc = 'tekst\n\n```python\nprint("hi")\n```\n';
    expect(visibleText(doc, 11)).toBe('tekst\n\n```python\nprint("hi")\n\n');
    expect(visibleText(doc, 30)).toBe('tekst\n\npython\nprint("hi")\n```\n');
    // On a content line neither fence comes back.
    expect(visibleText(doc, 20)).toBe('tekst\n\npython\nprint("hi")\n\n');
  });

  it('drops the language styling on the line being edited', () => {
    const doc = 'tekst\n\n```python\nprint("hi")\n```\n';
    const styled = (cursor: number) =>
      collectHiddenRanges(stateFor(doc, cursor), [{ from: 0, to: doc.length }]).some(
        ([, , deco]) => deco.spec.class === 'cm-wg-code-lang',
      );
    expect(styled(0)).toBe(true);
    expect(styled(11)).toBe(false);
  });

  it('keeps the fence of a block the user has not closed yet', () => {
    // One fence is the only signal that the block is still open; the tint alone
    // would read as a very long code block.
    for (const doc of ['```js\nconst a = 1;\n', '```', 'a\n\n```\n']) {
      expect(visibleText(doc, 0)).toBe(doc);
    }
  });

  it('still hides inline-code backticks next to a fenced block', () => {
    const doc = 'roep `fn()` aan\n\n```\nx\n```\n';
    expect(visibleText(doc, 0)).toBe('roep fn() aan\n\n\nx\n\n');
  });

  it('hides the fence marks and nothing else on the line', () => {
    // Indentation, the gap before the language and trailing spaces are all real
    // text outside every node.
    const doc = '   ```\tjs\n   x\n   ```   \n';
    const marks = new Set<string>();
    syntaxTree(stateFor(doc, 0)).iterate({
      enter: (n) => {
        if (n.name === 'CodeMark') marks.add(`${n.from}-${n.to}`);
      },
    });
    for (const [from, to] of replacements(doc, 0)) expect(marks).toContain(`${from}-${to}`);
  });

  it('leaves nested and tilde fences alone', () => {
    // The inner ``` of a four-backtick block is CodeText, not a marker.
    expect(visibleText('a\n\n````\n```\nx\n```\n````\n', 0)).toBe('a\n\n\n```\nx\n```\n\n');
    expect(visibleText('a\n\n~~~\nx\n~~~\n', 0)).toBe('a\n\n\nx\n\n');
  });

  it('hides the quote markers of a quoted code block too', () => {
    // quoteBar draws the quote instead, and the parser strips this prefix.
    const doc = '> citaat\n> ```js\n> x\n> ```\nna';
    expect(visibleText(doc, doc.length)).toBe('citaat\njs\nx\n\nna');
  });

  it('keeps the list marker on a fence line', () => {
    const doc = '- ```js\n  x\n  ```\nna';
    expect(visibleText(doc, doc.length)).toBe('- js\n  x\n  \nna');
  });
});

describe('collectFenceSurface', () => {
  const positions = (doc: string, cursor = 0) =>
    collectFenceSurface(stateFor(doc, cursor), [{ from: 0, to: doc.length }]).map(
      ([pos, deco]) => [pos, deco.spec.class] as const,
    );

  it('puts the surface on both fence lines and slims them', () => {
    // Line starts of ```js (0) and ``` (8) in '```js\nx\n```\n'. The caret is on
    // the last line, outside the block.
    expect(positions('```js\nx\n```\n', 12)).toEqual([
      [0, 'cm-md-codeblock cm-md-codeblock-first cm-wg-fence-slim'],
      [6, 'cm-wg-code-inner-top'],
      [6, 'cm-wg-code-inner-bottom'],
      [8, 'cm-md-codeblock cm-md-codeblock-last cm-wg-fence-slim'],
    ]);
  });

  it('gives the fence line the caret stands on its full height back', () => {
    // A revealed ``` needs the row's full height back.
    expect(positions('```js\nx\n```\n', 0)[0]).toEqual([
      0,
      'cm-md-codeblock cm-md-codeblock-first',
    ]);
  });

  it('covers an empty block, which NLDD tints not at all', () => {
    // Both lines are fence lines, so without this the block renders as nothing.
    expect(positions('```\n```\nna', 10)).toEqual([
      [0, 'cm-md-codeblock cm-md-codeblock-first cm-wg-fence-slim'],
      [4, 'cm-md-codeblock cm-md-codeblock-last cm-wg-fence-slim'],
    ]);
  });

  it('never slims the fence of an unclosed block, which stays visible', () => {
    expect(positions('```js\nx\n')).toEqual([
      [0, 'cm-md-codeblock cm-md-codeblock-first'],
      [6, 'cm-wg-code-inner-top'],
      [6, 'cm-wg-code-inner-bottom'],
    ]);
  });

  it('emits ascending positions across two blocks', () => {
    const out = positions('```\na\n```\n\n```\nb\n```\n', 11);
    expect(out.map(([pos]) => pos)).toEqual([...out.map(([pos]) => pos)].sort((x, y) => x - y));
    expect(out.filter(([, cls]) => cls?.startsWith('cm-md-codeblock'))).toHaveLength(4);
  });

  it('hides the heading marker and its space', () => {
    // Caret on the last line, so the heading is not the construct being edited.
    expect(visibleText('## Kop\n\ntekst', 10)).toBe('Kop\n\ntekst');
  });

  it('hides the quote marker and its space', () => {
    expect(visibleText('> geciteerd\n\ntekst', 15)).toBe('geciteerd\n\ntekst');
  });

  it('reduces a link to its text', () => {
    expect(visibleText('zie [de docs](https://example.org) hier', 0)).toBe('zie de docs hier');
  });

  it('reveals the markers of the construct the caret is in', () => {
    const doc = 'een **vet** woord';
    // caret inside "vet"
    expect(visibleText(doc, 7)).toBe(doc);
    // caret far away
    expect(visibleText(doc, 0)).toBe('een vet woord');
  });

  it('replaces a task marker with a widget and drops the bullet before it', () => {
    // Caret on the second line, so the first is not the one being edited.
    const doc = '- [ ] taak\nandere regel';
    const hits = collectHiddenRanges(stateFor(doc, doc.length), [{ from: 0, to: doc.length }]);
    // The bullet and the `[ ]` go; the space after the marker stays, so the
    // text does not butt up against the checkbox.
    expect(visibleText(doc, doc.length)).toBe(' taak\nandere regel');
    expect(hits.some(([, , deco]) => deco.spec.widget)).toBe(true);
  });

  it('brings the raw task markdown back on the line being edited', () => {
    // A source editor has to stay hand-editable: on the caret's line the
    // checkbox gives way to `- [x] `, like every other marker here.
    const doc = '- [x] taak\nandere regel';
    expect(visibleText(doc, 3)).toBe(doc);
    const hits = collectHiddenRanges(stateFor(doc, 3), [{ from: 0, to: doc.length }]);
    expect(hits.some(([, , deco]) => deco.spec.widget)).toBe(false);
  });

  it('emits ranges in ascending, non-overlapping order', () => {
    // A link inside a heading with emphasis in its text is the shape most likely
    // to produce nested ranges, which RangeSetBuilder would throw on.
    const doc = '## Zie [**de** docs](https://example.org) en `code`\n';
    const hits = collectHiddenRanges(stateFor(doc, 0), [{ from: 0, to: doc.length }]);
    let last = -1;
    for (const [from, to] of hits) {
      expect(from).toBeGreaterThanOrEqual(last);
      expect(to).toBeGreaterThanOrEqual(from);
      last = to;
    }
  });
});

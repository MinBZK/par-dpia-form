/**
 * The half of hideMarkers that only runs inside a live EditorView: the four
 * ViewPlugins and the task-list checkbox widget. The sibling
 * components-task-editor-hideMarkers.cov.test.ts covers the pure range
 * collection; together they take the module to 100%.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { EditorView, type WidgetType } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import {
  collectHiddenRanges,
  hideMarkdownMarkers,
} from '../../src/components/task/editor/hideMarkers'

let view: EditorView | null = null

/** Same language config as nldd-text-editor, so the syntax tree matches. */
function mountView(doc: string, cursor = 0, readOnly = false) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ extensions: GFM }),
        hideMarkdownMarkers,
        EditorState.readOnly.of(readOnly),
      ],
    }),
    parent,
  })
  return view
}

/** What the editor actually shows, with the hidden markers gone. */
const shown = (v: EditorView) => v.dom.textContent ?? ''

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

describe('rendering through a live view', () => {
  it('drops the markers on the lines the caret is not on', () => {
    const v = mountView('## Kop\ntekst met **vet**', 0)
    // The caret is on the heading, so that line keeps its ## and the other
    // line loses its **.
    expect(shown(v)).toContain('## Kop')
    expect(shown(v)).not.toContain('**vet**')
  })

  it('brings the markers back on the line the caret moves to', () => {
    const v = mountView('## Kop\ntekst met **vet**', 0)
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    expect(shown(v)).toContain('**vet**')
    expect(shown(v)).not.toContain('## Kop')
  })

  it('rebuilds when the document changes', () => {
    const v = mountView('gewone regel\n', 0)
    v.dispatch({
      changes: { from: v.state.doc.length, insert: 'met **vet** erin' },
      selection: { anchor: 0 },
    })
    expect(shown(v)).toContain('met vet erin')
    expect(shown(v)).not.toContain('**vet**')
  })

  it('marks an ordered list marker so it can be aligned', () => {
    const v = mountView('1. een\n2. twee', 0)
    expect(v.dom.querySelectorAll('.cm-wg-ordered').length).toBe(2)
  })

  it('leaves a bullet marker unmarked', () => {
    const v = mountView('- een\n- twee', 0)
    expect(v.dom.querySelectorAll('.cm-wg-ordered').length).toBe(0)
  })

  it('flags the line the caret sits on as raw', () => {
    const v = mountView('eerste\ntweede', 0)
    expect(v.dom.querySelectorAll('.cm-wg-raw').length).toBe(1)
  })

  it('moves that flag along with the caret', () => {
    const v = mountView('eerste\ntweede', 0)
    const before = v.dom.querySelector('.cm-wg-raw')?.textContent
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    expect(v.dom.querySelector('.cm-wg-raw')?.textContent).not.toBe(before)
  })

  it('extends the code surface over the hidden fence rows', () => {
    const v = mountView('tekst\n```js\ncode\n```', 0)
    expect(v.dom.querySelectorAll('.cm-md-codeblock').length).toBeGreaterThan(0)
  })

  it('keeps an empty fenced block visible', () => {
    const v = mountView('tekst\n```\n```', 0)
    expect(v.dom.querySelectorAll('.cm-md-codeblock').length).toBeGreaterThan(0)
  })
})

describe('the task-list checkbox', () => {
  // A spare first line to park the caret on: the line the caret is on shows
  // its raw source by design, so a task there has no widget.
  const TASKS = 'tekst\n- [ ] open taak\n- [x] gedane taak'

  it('replaces the source brackets with a checkbox', () => {
    const v = mountView(TASKS, 0)
    const boxes = v.dom.querySelectorAll<HTMLInputElement>('.cm-task-box')
    expect(boxes.length).toBe(2)
    expect(boxes[0].checked).toBe(false)
    expect(boxes[1].checked).toBe(true)
  })

  it('names its state for assistive tech, since the source text is gone', () => {
    const v = mountView(TASKS, 0)
    const boxes = v.dom.querySelectorAll('.cm-task-box')
    expect(boxes[0].getAttribute('aria-label')).toBe('Taak niet afgerond')
    expect(boxes[1].getAttribute('aria-label')).toBe('Taak afgerond')
  })

  it('stays out of the tab order: the line is edited as text', () => {
    const v = mountView(TASKS, 0)
    expect(v.dom.querySelector<HTMLInputElement>('.cm-task-box')?.tabIndex).toBe(-1)
  })

  it('ticks the box in the source when clicked', () => {
    const v = mountView(TASKS, 0)
    const box = v.dom.querySelector<HTMLInputElement>('.cm-task-box')!
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(v.state.doc.toString()).toContain('- [x] open taak')
  })

  it('unticks a box that was ticked', () => {
    const v = mountView(TASKS, 0)
    const boxes = v.dom.querySelectorAll<HTMLInputElement>('.cm-task-box')
    boxes[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(v.state.doc.toString()).toContain('- [ ] gedane taak')
  })

  it('is disabled and inert while the editor is read-only', () => {
    const v = mountView(TASKS, 0, true)
    const box = v.dom.querySelector<HTMLInputElement>('.cm-task-box')!
    expect(box.disabled).toBe(true)
    box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(v.state.doc.toString()).toContain('- [ ] open taak')
  })

  it('reuses the widget when nothing about it changed', () => {
    const v = mountView(TASKS, 0)
    const first = v.dom.querySelector('.cm-task-box')
    // A selection change within the spare line re-runs the plugin; an equal
    // widget is not redrawn.
    v.dispatch({ selection: { anchor: 3 } })
    expect(v.dom.querySelector('.cm-task-box')).toBe(first)
  })
})

describe('links', () => {
  it('shows only the link text away from the caret', () => {
    const v = mountView('tekst\nzie [de site](https://example.org) hier', 0)
    expect(shown(v)).toContain('zie de site hier')
    expect(shown(v)).not.toContain('https://example.org')
  })

  it('shows the whole source once the caret is inside the link', () => {
    const doc = 'tekst\nzie [de site](https://example.org) hier'
    const v = mountView(doc, doc.length - 5)
    expect(shown(v)).toContain('[de site](https://example.org)')
  })

  it('leaves a bare autolink alone: it has no brackets to hide', () => {
    const v = mountView('tekst\nzie <https://example.org>', 0)
    expect(shown(v)).toContain('https://example.org')
  })
})

describe('fenced blocks', () => {
  it('handles two blocks in one document', () => {
    const v = mountView('tekst\n```js\neen\n```\ntussen\n```\ntwee\n```', 0)
    expect(v.dom.querySelectorAll('.cm-md-codeblock').length).toBeGreaterThan(1)
  })

  it('handles a block left unclosed at the end of the document', () => {
    const v = mountView('tekst\n```js\nnog bezig', 0)
    expect(shown(v)).toContain('nog bezig')
  })

  it('keeps the language label once the backticks are hidden', () => {
    const v = mountView('tekst\n```js\ncode\n```', 0)
    expect(v.dom.querySelectorAll('.cm-wg-code-lang').length).toBe(1)
  })
})

describe('redrawing', () => {
  it('leaves the decorations alone when nothing relevant changed', () => {
    const v = mountView('tekst met **vet**\ntweede regel', 0)
    const before = shown(v)
    // An annotation-only transaction: no doc change, no selection change.
    v.dispatch({})
    expect(shown(v)).toBe(before)
  })

  it('lets events through to the editor rather than swallowing them', () => {
    const doc = 'tekst\n- [ ] taak'
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [markdown({ extensions: GFM })],
    })
    const widget = collectHiddenRanges(state, [{ from: 0, to: doc.length }])
      .map(([, , deco]) => (deco.spec as { widget?: WidgetType }).widget)
      .find(Boolean)!
    // CodeMirror asks the widget whether to handle an event itself; false means
    // the click reaches the editor and moves the caret onto the task line.
    expect(widget.ignoreEvent()).toBe(false)
    expect(widget.eq(widget)).toBe(true)
  })
})

describe('edge shapes the parser can still produce', () => {
  it('handles a heading marker with nothing after it', () => {
    // No trailing space, so the marker runs to the end of the line.
    const v = mountView('tekst\n##', 0)
    expect(shown(v)).toContain('tekst')
  })

  it('handles a quote marker on an empty line', () => {
    const v = mountView('tekst\n>', 0)
    expect(shown(v)).toContain('tekst')
  })

  it('handles a nested task list, where the bullet is indented', () => {
    const v = mountView('tekst\n- boven\n  - [ ] genest', 0)
    expect(v.dom.querySelectorAll('.cm-task-box').length).toBe(1)
  })
})

describe('a task inside an ordered list', () => {
  it('keeps the number: there is no bullet dot to hide in front of the box', () => {
    const v = mountView('tekst\n1. [ ] taak', 0)
    expect(v.dom.querySelectorAll('.cm-task-box').length).toBe(1)
    expect(shown(v)).toContain('1.')
  })
})

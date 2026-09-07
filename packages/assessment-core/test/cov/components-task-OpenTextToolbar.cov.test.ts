import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import OpenTextToolbar from '../../src/components/task/OpenTextToolbar.vue'

/**
 * A stand-in for nldd-text-editor: the toolbar only ever touches the command
 * methods, getState() and the view, so the fake records the calls and reports
 * whatever formats a test wants active.
 */
function fakeEditor(active: Record<string, boolean | number> = {}, doc = '') {
  const calls: string[] = []
  const el = document.createElement('div') as HTMLElement & Record<string, unknown>
  // The caret sits at the end of `doc`; dispatch records where it is moved to.
  const selection = { main: { to: doc.length } }
  const moves: number[] = []
  el.view = {
    state: {
      selection,
      doc: {
        lineAt: () => ({ to: doc.length }),
        sliceString: (from: number, to: number) => doc.slice(from, to),
      },
    },
    dispatch: (spec: { selection: { anchor: number } }) => moves.push(spec.selection.anchor),
  }
  el.toggleBold = () => calls.push('bold')
  el.toggleItalic = () => calls.push('italic')
  el.toggleStrikethrough = () => calls.push('strikethrough')
  el.toggleQuote = () => calls.push('quote')
  el.toggleLink = () => calls.push('link')
  el.setList = (type: string) => calls.push(`list:${type}`)
  el.setHeading = (level: number) => calls.push(`heading:${level}`)
  // A fresh object each read, like the real element: the toolbar swaps the
  // whole ref, so returning the same reference would not register as a change.
  el.getState = () => ({ active: { ...active } })
  return { el: el as never, calls, moves, selection }
}

function mountToolbar(editor: unknown = null) {
  return mount(OpenTextToolbar, {
    props: { editor: editor as never, accessibleLabel: 'Opmaak voor Vraag 1' },
  })
}

type Wrapper = ReturnType<typeof mountToolbar>

/** The segmented control in the toolbar item carrying `label`. */
const groupFor = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('nldd-toolbar-item')
    .find(i => i.attributes('label') === label)!

/** A checkbox segmented control reports its whole selected set. */
const emitValues = (wrapper: Wrapper, label: string, values: string[]) =>
  groupFor(wrapper, label).find('nldd-segmented-control')
    .trigger('change', { detail: { values } } as never)

describe('OpenTextToolbar.vue', () => {
  it('labels the toolbar with the field it belongs to', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find('nldd-toolbar').attributes('label')).toBe('Opmaak voor Vraag 1')
  })

  it('names every group, so the overflow menu can head them', () => {
    const wrapper = mountToolbar()
    const labels = wrapper.findAll('nldd-toolbar-item').map(i => i.attributes('label'))
    expect(labels).toEqual(['Tekststijl', 'Nadruk', 'Lijst', 'Citaat', 'Link'])
  })

  it('nests the heading menu inside its button, so the button can open it', () => {
    // A sibling nldd-menu renders but nothing opens it: nldd-button only
    // anchors and toggles what sits in its own popup slot.
    const wrapper = mountToolbar()
    const button = wrapper.find('nldd-button')
    expect(button.find('nldd-menu[slot="popup"]').exists()).toBe(true)
    expect(button.attributes('popup-type')).toBe('menu')
  })

  it('keeps each group together in the overflow menu', () => {
    const wrapper = mountToolbar()
    const groups = wrapper.findAll('nldd-menu-group[slot="overflow"]')
      .map(g => g.attributes('text'))
    expect(groups).toEqual(['Tekststijl', 'Nadruk', 'Lijst'])
  })

  it('overflows the rarer groups first', () => {
    const wrapper = mountToolbar()
    const priority = (label: string) => Number(groupFor(wrapper, label).attributes('priority'))
    // A lower priority leaves the bar first.
    expect(priority('Tekststijl')).toBeGreaterThan(priority('Nadruk'))
    expect(priority('Nadruk')).toBeGreaterThan(priority('Lijst'))
    expect(priority('Lijst')).toBeGreaterThan(priority('Citaat'))
  })

  it('offers the marks and list types as icons', () => {
    const wrapper = mountToolbar()
    const icons = (label: string) =>
      groupFor(wrapper, label).findAll('nldd-segmented-control-item')
        .map(i => i.attributes('icon'))
    expect(icons('Nadruk')).toEqual(['bold', 'italic', 'strikethrough'])
    // No third "no list" button: it would sit permanently selected on ordinary
    // text. Pressing the active type strips the list instead.
    expect(icons('Lijst')).toEqual(['bullet-list', 'numbered-list'])
  })

  describe('running commands', () => {
    it('runs the mark the user just switched on', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      await emitValues(wrapper, 'Nadruk', ['italic'])
      expect(calls).toEqual(['bold', 'italic'])
    })

    it('runs the mark the user just switched off', async () => {
      const { el, calls } = fakeEditor({ bold: true })
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', [])
      expect(calls).toEqual(['bold'])
    })

    it('ignores a report that matches what is already active', async () => {
      const { el, calls } = fakeEditor({ bold: true })
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      expect(calls).toEqual([])
    })

    it('sets the list type the user picked', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Lijst', ['bullet'])
      expect(calls).toEqual(['list:bullet'])
    })

    it('converts between list types in one step', async () => {
      // The control still counts bullet among its values; the editor's own
      // state is what says which one is new.
      const { el, calls } = fakeEditor({ bulletList: true })
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Lijst', ['bullet', 'ordered'])
      expect(calls).toEqual(['list:ordered'])
    })

    it('strips the list when the active type is switched off', async () => {
      const { el, calls } = fakeEditor({ orderedList: true })
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Lijst', [])
      expect(calls).toEqual(['list:none'])
    })

    it('runs the quote and link toggles', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      await groupFor(wrapper, 'Citaat').find('nldd-toggle-button').trigger('change')
      await groupFor(wrapper, 'Link').find('nldd-toggle-button').trigger('change')
      expect(calls).toEqual(['quote', 'link'])
    })

    it('sets the heading level from the picker', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      const items = wrapper.find('nldd-menu').findAll('nldd-menu-item')
      await items[1].trigger('select')
      await items[0].trigger('select')
      expect(calls).toEqual(['heading:2', 'heading:0'])
    })

    it('runs the same commands from the overflow menu', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      const inGroup = (text: string, index: number) =>
        wrapper.findAll('nldd-menu-group[slot="overflow"]')
          .find(g => g.attributes('text') === text)!
          .findAll('nldd-menu-item')[index]
      await inGroup('Nadruk', 0).trigger('select')
      await inGroup('Lijst', 1).trigger('select')
      await inGroup('Tekststijl', 2).trigger('select')
      await wrapper.findAll('nldd-menu-item[slot="overflow"]')[0].trigger('select')
      expect(calls).toEqual(['bold', 'list:ordered', 'heading:3', 'quote'])
    })

    it('strips the list from the overflow menu when it is already on', async () => {
      const { el, calls } = fakeEditor({ bulletList: true })
      const wrapper = mountToolbar(el)
      const lists = wrapper.findAll('nldd-menu-group[slot="overflow"]')
        .find(g => g.attributes('text') === 'Lijst')!
        .findAll('nldd-menu-item')
      await lists[0].trigger('select')
      expect(calls).toEqual(['list:none'])
    })

    it('does nothing without an editor', async () => {
      const wrapper = mountToolbar(null)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      await emitValues(wrapper, 'Lijst', ['bullet'])
      await groupFor(wrapper, 'Citaat').find('nldd-toggle-button').trigger('change')
      await wrapper.find('nldd-menu').findAll('nldd-menu-item')[1].trigger('select')
      expect(wrapper.find('nldd-toolbar').exists()).toBe(true)
    })

    it('survives an editor that has not upgraded yet', async () => {
      const bare = document.createElement('div')
      const wrapper = mountToolbar(bare)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      await emitValues(wrapper, 'Lijst', ['bullet'])
      await groupFor(wrapper, 'Link').find('nldd-toggle-button').trigger('change')
      expect(wrapper.find('nldd-toolbar').exists()).toBe(true)
    })

    it('ignores a marks change event carrying no values at all', async () => {
      const { el, calls } = fakeEditor()
      const wrapper = mountToolbar(el)
      await groupFor(wrapper, 'Nadruk').find('nldd-segmented-control').trigger('change')
      expect(calls).toEqual([])
    })

    it('treats a list change event with no values as "strip the list"', async () => {
      const { el, calls } = fakeEditor({ bulletList: true })
      const wrapper = mountToolbar(el)
      await groupFor(wrapper, 'Lijst').find('nldd-segmented-control').trigger('change')
      expect(calls).toEqual(['list:none'])
    })
  })

  describe('where the caret lands after an inline command', () => {
    // The design system leaves the selection on the wrapped text, inside the
    // new markers, so the next keystroke would replace it.
    it('steps past the closing markers a command just added', async () => {
      const { el, moves, selection } = fakeEditor({}, '**woord**')
      selection.main.to = 7 // between the text and its closing **
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      expect(moves).toEqual([9])
    })

    it('stops at the end of the line rather than running past it', async () => {
      const { el, moves, selection } = fakeEditor({}, '**woord**')
      selection.main.to = 9
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['italic'])
      expect(moves).toEqual([9])
    })

    it('leaves the caret alone when no markers follow it', async () => {
      const { el, moves, selection } = fakeEditor({}, 'gewone tekst')
      selection.main.to = 6
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['strikethrough'])
      expect(moves).toEqual([6])
    })

    it('does not touch the caret for a line command', async () => {
      const { el, moves } = fakeEditor({}, '- punt')
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Lijst', ['bullet'])
      await groupFor(wrapper, 'Citaat').find('nldd-toggle-button').trigger('change')
      expect(moves).toEqual([])
    })

    it('survives an editor that exposes no view', async () => {
      const el = document.createElement('div') as HTMLElement & Record<string, unknown>
      el.toggleBold = () => {}
      el.getState = () => ({ active: {} })
      const wrapper = mountToolbar(el)
      await emitValues(wrapper, 'Nadruk', ['bold'])
      expect(wrapper.find('nldd-toolbar').exists()).toBe(true)
    })
  })

  describe('reflecting the state at the caret', () => {
    it('marks the active formats as selected', () => {
      const { el } = fakeEditor({ bold: true, quote: true, orderedList: true })
      const wrapper = mountToolbar(el)
      const marks = groupFor(wrapper, 'Nadruk').findAll('nldd-segmented-control-item')
      expect(marks[0].attributes('selected')).toBeDefined()
      expect(marks[1].attributes('selected')).toBeUndefined()

      const lists = groupFor(wrapper, 'Lijst').findAll('nldd-segmented-control-item')
      expect(lists[0].attributes('selected')).toBeUndefined()
      expect(lists[1].attributes('selected')).toBeDefined()

      expect(groupFor(wrapper, 'Citaat').find('nldd-toggle-button')
        .attributes('selected')).toBeDefined()
      expect(groupFor(wrapper, 'Link').find('nldd-toggle-button')
        .attributes('selected')).toBeUndefined()
    })

    it('names the heading level at the caret', () => {
      const { el } = fakeEditor({ heading: 2 })
      const wrapper = mountToolbar(el)
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Kop')

      const selected = wrapper.find('nldd-menu').findAll('nldd-menu-item')
        .filter(i => i.attributes('selected') !== undefined)
        .map(i => i.attributes('text'))
      expect(selected).toEqual(['Kop'])
    })

    it('falls back to body text for a level with no entry', () => {
      const { el } = fakeEditor({ heading: 5 })
      const wrapper = mountToolbar(el)
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Gewone tekst')
    })

    it('re-reads the state when the editor reports a change', async () => {
      const active: Record<string, boolean | number> = {}
      const { el } = fakeEditor(active)
      const wrapper = mountToolbar(el)
      const bold = () => groupFor(wrapper, 'Nadruk')
        .findAll('nldd-segmented-control-item')[0].attributes('selected')
      expect(bold()).toBeUndefined()

      active.bold = true
      ;(el as HTMLElement).dispatchEvent(new CustomEvent('nldd-text-editor-state'))
      await nextTick()
      expect(bold()).toBeDefined()
    })

    it('reports nothing active before the editor arrives', () => {
      const wrapper = mountToolbar(null)
      expect(wrapper.find('nldd-segmented-control-item').attributes('selected')).toBeUndefined()
      expect(wrapper.find('nldd-button').attributes('text')).toBe('Gewone tekst')
    })
  })

  describe('listening to the editor', () => {
    it('moves the listener when the editor element is replaced', async () => {
      const first = fakeEditor()
      const second = fakeEditor({ italic: true })
      const removeFirst = vi.spyOn(first.el as HTMLElement, 'removeEventListener')

      const wrapper = mountToolbar(first.el)
      await wrapper.setProps({ editor: second.el })

      expect(removeFirst).toHaveBeenCalledWith('nldd-text-editor-state', expect.any(Function))
      expect(groupFor(wrapper, 'Nadruk').findAll('nldd-segmented-control-item')[1]
        .attributes('selected')).toBeDefined()
    })

    it('stops listening once unmounted', () => {
      const { el } = fakeEditor()
      const remove = vi.spyOn(el as HTMLElement, 'removeEventListener')
      mountToolbar(el).unmount()
      expect(remove).toHaveBeenCalledWith('nldd-text-editor-state', expect.any(Function))
    })

    it('unmounts cleanly without an editor', () => {
      expect(() => mountToolbar(null).unmount()).not.toThrow()
    })
  })
})

import { describe, it, expect } from 'vitest'
import { applyMarkdownCommand, type EditorSelection } from '../../src/utils/markdownCommands'

function sel(text: string, start: number, end: number): EditorSelection {
  return { text, selectionStart: start, selectionEnd: end }
}

describe('markdownCommands', () => {
  describe('bold / italic (inline wrap toggle)', () => {
    it('wraps the selection with ** for bold', () => {
      expect(applyMarkdownCommand('bold', sel('abc', 0, 3))).toEqual({
        text: '**abc**', selectionStart: 2, selectionEnd: 5,
      })
    })

    it('unwraps when the selection is already bold', () => {
      expect(applyMarkdownCommand('bold', sel('**abc**', 2, 5))).toEqual({
        text: 'abc', selectionStart: 0, selectionEnd: 3,
      })
    })

    it('wraps the selection with * for italic', () => {
      expect(applyMarkdownCommand('italic', sel('x', 0, 1))).toEqual({
        text: '*x*', selectionStart: 1, selectionEnd: 2,
      })
    })
  })

  describe('heading (line prefix toggle)', () => {
    it('adds ## to a single line without a trailing newline', () => {
      expect(applyMarkdownCommand('heading', sel('Titel', 0, 0))).toEqual({
        text: '## Titel', selectionStart: 0, selectionEnd: 8,
      })
    })

    it('removes an existing heading prefix', () => {
      expect(applyMarkdownCommand('heading', sel('## Titel', 3, 3))).toEqual({
        text: 'Titel', selectionStart: 0, selectionEnd: 5,
      })
    })

    it('only affects the line the selection sits on when a newline follows', () => {
      // Selection covers just "een"; "twee" on the next line must be untouched.
      expect(applyMarkdownCommand('heading', sel('een\ntwee', 0, 3))).toEqual({
        text: '## een\ntwee', selectionStart: 0, selectionEnd: 6,
      })
    })
  })

  describe('bulletList (multi-line)', () => {
    it('adds "- " to every spanned line, leaving already-prefixed lines as-is', () => {
      // First line already a bullet, second is not → add only where missing.
      expect(applyMarkdownCommand('bulletList', sel('- een\ntwee', 0, 10))).toEqual({
        text: '- een\n- twee', selectionStart: 0, selectionEnd: 12,
      })
    })

    it('removes "- "/"* " from every line when all are already bullets', () => {
      expect(applyMarkdownCommand('bulletList', sel('- een\n* twee', 0, 12))).toEqual({
        text: 'een\ntwee', selectionStart: 0, selectionEnd: 8,
      })
    })
  })

  describe('orderedList', () => {
    it('adds an ordered-list prefix', () => {
      expect(applyMarkdownCommand('orderedList', sel('item', 0, 0))).toEqual({
        text: '1. item', selectionStart: 0, selectionEnd: 7,
      })
    })
  })

  describe('link', () => {
    it('wraps the selection and selects the url placeholder', () => {
      expect(applyMarkdownCommand('link', sel('abc', 0, 3))).toEqual({
        text: '[abc](url)', selectionStart: 6, selectionEnd: 9,
      })
    })

    it('inserts a "tekst" placeholder when there is no selection', () => {
      expect(applyMarkdownCommand('link', sel('', 0, 0))).toEqual({
        text: '[tekst](url)', selectionStart: 8, selectionEnd: 11,
      })
    })
  })
})

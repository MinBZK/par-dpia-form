import { describe, it, expect } from 'vitest'
import { AssessmentTextEditor } from '../../src/components/task/editor/AssessmentTextEditor'
import { hideMarkdownMarkers } from '../../src/components/task/editor/hideMarkers'
import { isEditing } from '../../src/components/task/editor/caretReveal'

// buildExtensions is protected: the subclass is the only caller, so a test
// reaching it needs the same escape hatch a subclass would have.
type WithExtensions = { buildExtensions: () => unknown[] }

describe('AssessmentTextEditor', () => {
  it('adds the marker-hiding extension to the ones the design system builds', () => {
    const editor = new AssessmentTextEditor() as unknown as WithExtensions
    expect(editor.buildExtensions()).toEqual([hideMarkdownMarkers])
  })

  it('registers itself once, under its own tag', () => {
    expect(customElements.get('assessment-text-editor')).toBe(AssessmentTextEditor)
  })
})

describe('isEditing', () => {
  const range = (from: number, to: number) => ({ from, to }) as never

  it('is true while the selection sits inside the construct', () => {
    expect(isEditing(range(5, 5), 3, 8)).toBe(true)
  })

  it('is true when the caret rests against either edge', () => {
    expect(isEditing(range(3, 3), 3, 8)).toBe(true)
    expect(isEditing(range(8, 8), 3, 8)).toBe(true)
  })

  it('is true for a selection that only overlaps the construct', () => {
    expect(isEditing(range(1, 4), 3, 8)).toBe(true)
  })

  it('is false once the selection clears the construct', () => {
    expect(isEditing(range(0, 2), 3, 8)).toBe(false)
    expect(isEditing(range(9, 12), 3, 8)).toBe(false)
  })
})

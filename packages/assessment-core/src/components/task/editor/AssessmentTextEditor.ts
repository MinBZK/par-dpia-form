/**
 * `<nldd-text-editor>` with the markdown syntax markers hidden away from the
 * caret, the way Obsidian's live preview does it.
 *
 * The design system dims the markers but exposes no switch to drop them, so a
 * `#` sits in front of every heading and `**` around every bold run, on every
 * line, all the time. In an answer of a few paragraphs that is a lot of noise
 * for something the reader is not editing right now.
 *
 * `NLDDCodeMirrorElement` declares `buildExtensions()` as protected — a
 * documented seam for subclasses — and re-runs it from `connectedCallback`, so
 * the extension survives the element being moved in the DOM.
 *
 * This is a stopgap: the same need has been raised with the NLDD team from
 * more than one project, and an attribute on the element itself would spare
 * every consumer this subclass. See docs/nldd-feedback.md.
 */
import type { Extension } from '@codemirror/state'
import { NLDDTextEditor } from '@nldd/design-system/text-editor'

import { hideMarkdownMarkers } from './hideMarkers'

export class AssessmentTextEditor extends NLDDTextEditor {
  protected buildExtensions(): Extension[] {
    return [...super.buildExtensions(), hideMarkdownMarkers]
  }
}

/* istanbul ignore next -- the guard only matters on a second evaluation of this
   module (Vite HMR); under test the module is evaluated once per worker, so the
   already-registered branch is unreachable. */
if (!customElements.get('assessment-text-editor')) {
  customElements.define('assessment-text-editor', AssessmentTextEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    'assessment-text-editor': AssessmentTextEditor
  }
}

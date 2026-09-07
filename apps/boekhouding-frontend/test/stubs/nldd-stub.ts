// Empty stand-in for every @nldd/design-system import in unit tests: the Lit
// custom elements stay unregistered in jsdom, so nldd-* tags render as inert
// host elements and tests assert on attributes, slots and CustomEvents.

/**
 * Except this one: AssessmentTextEditor subclasses it, so an empty stub would
 * make that module throw at import time ("class extends undefined"). It stays
 * unregistered like the rest — a bare HTMLElement with the one protected seam
 * the subclass overrides.
 */
export class NLDDTextEditor extends HTMLElement {
  protected buildExtensions(): unknown[] {
    return []
  }
}

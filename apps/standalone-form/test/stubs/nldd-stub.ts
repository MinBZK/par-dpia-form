// Empty stand-in for every @nldd/design-system import in unit tests: the Lit
// custom elements stay unregistered in jsdom, so nldd-* tags render as inert
// host elements and tests assert on attributes, slots and CustomEvents.
export {}

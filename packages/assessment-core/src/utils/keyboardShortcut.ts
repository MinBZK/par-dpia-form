// Format a keyboard shortcut for display in a tooltip, using the platform's
// modifier convention: ⌘/⇧ on macOS, "Ctrl+"/"Shift+" elsewhere.
export function formatShortcut(key: string, shift: boolean, isMac: boolean): string {
  const mod = isMac ? '⌘' : 'Ctrl+'
  const shiftPart = shift ? (isMac ? '⇧' : 'Shift+') : ''
  return `${mod}${shiftPart}${key}`
}

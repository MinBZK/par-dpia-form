/**
 * Taken from Waggle (https://code.overheid.nl/robbertbos/waggle), EUPL-1.2,
 * frontend/src/components/composer/nldd/. Unchanged except for this notice.
 */
import type { SelectionRange } from '@codemirror/state';

/**
 * Whether the selection touches `[from, to]` - the rule the marker extensions
 * share: a construct shows its raw source while the caret is inside or against
 * it, and renders otherwise.
 */
export function isEditing(sel: SelectionRange, from: number, to: number): boolean {
  return sel.from <= to && sel.to >= from;
}

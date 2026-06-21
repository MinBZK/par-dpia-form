// The set of toggle/insert formatting commands the markdown toolbar can emit.
// Each editor surface maps these onto its own API (the TipTap editor maps them to
// chain commands such as toggleBold/toggleBulletList). Headings are not in this
// list: they carry a level and are chosen via the toolbar's level dropdown, which
// emits a dedicated event instead of a plain command.
export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'code'
  | 'codeBlock'
  | 'divider'
  | 'link'

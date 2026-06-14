// The set of formatting commands the markdown toolbar can emit. Each editor
// surface maps these onto its own API (the TipTap editor maps them to chain
// commands such as toggleBold/toggleHeading).
export type MarkdownCommand =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'link'

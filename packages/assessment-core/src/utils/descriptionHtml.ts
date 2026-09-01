// Task descriptions come from the YAML sources as a mix of prose and block HTML
// (<ul>, <nldd-banner>). Their line breaks are meaningful, so they render with
// white-space: pre-line -- but a newline next to a block element then shows up
// as an extra blank line on top of that block's own margin. Drop exactly those.
const BLOCK_TAGS = 'ul|ol|li|div|p|h[1-6]|table|tr|blockquote|hr|nldd-banner|nldd-rich-text'

const BEFORE_BLOCK = new RegExp(`\\s*\\n\\s*(?=</?(?:${BLOCK_TAGS})[\\s/>])`, 'g')
const AFTER_BLOCK = new RegExp(`(</?(?:${BLOCK_TAGS})(?:\\s[^>]*)?/?>)\\s*\\n\\s*`, 'g')

export function tidyDescriptionHtml(html: string | undefined): string {
  return (html ?? '').replace(BEFORE_BLOCK, '').replace(AFTER_BLOCK, '$1')
}

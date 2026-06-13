export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function stripHtml(str: string): string {
  if (!str.includes('<')) return str
  return str.replace(/<[^>]*>/g, '')
}

/**
 * Shape check for an LLM API key that arrived in a request header.
 *
 * The key is never ours: it belongs to the person making the call (see the
 * `chat` block in config.ts). We cannot tell whether it is valid — only VLAM
 * can — but we can refuse the shapes that have no business reaching an
 * outbound HTTP header: a newline splits the request, a control character or a
 * non-ASCII byte cannot be encoded, and a value of the wrong length is a
 * mistake rather than a credential.
 *
 * The caller reports the reason without ever echoing the value.
 */

// Long enough to exclude a stray word or a truncated paste, short enough to
// exclude a whole file pasted into the field by accident.
const MIN_LENGTH = 20
const MAX_LENGTH = 512

export type ApiKeyRejection = 'ontbreekt' | 'lengte' | 'tekens'

/** null when the key is usable, otherwise why it was refused. */
export function validateApiKey(value: string | undefined): ApiKeyRejection | null {
  if (!value) return 'ontbreekt'
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return 'lengte'
  // Printable ASCII only: excludes control characters, whitespace (including
  // the CR/LF that would let a header be split) and everything non-ASCII.
  for (const char of value) {
    const code = char.codePointAt(0)!
    if (code <= 0x20 || code >= 0x7f) return 'tekens'
  }
  return null
}

export const API_KEY_REJECTION_DETAIL: Record<ApiKeyRejection, string> = {
  ontbreekt: 'Stuur je eigen VLAM-sleutel mee in de header x-vlam-api-key.',
  lengte: `De waarde in x-vlam-api-key heeft een onwaarschijnlijke lengte (verwacht ${MIN_LENGTH}-${MAX_LENGTH} tekens).`,
  tekens: 'De waarde in x-vlam-api-key bevat spaties, stuurtekens of niet-ASCII-tekens.',
}

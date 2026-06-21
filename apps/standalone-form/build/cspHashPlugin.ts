import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

// CSP directives shared between the <meta> (in the single-file HTML) and the
// nginx header. `font-src`/`img-src` allow `data:` because the single-file build
// inlines the favicon and some assets as data URIs.
// `trusted-types` must allowlist every policy name actually created at runtime:
// `default` (our DOMPurify catch-all), `vue` (Vue's own v-html policy) and
// `dompurify` (DOMPurify's internal policy).
const SHARED_DIRECTIVES =
  "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; require-trusted-types-for 'script'; " +
  'trusted-types default vue dompurify;'

function sha256(content: string): string {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`
}

// Hash every INLINE <script>/<style> (skip those with a src/href: external,
// already governed by `'self'`).
function collectHashes(html: string, tag: 'script' | 'style'): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const hashes: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1)
    if (/\s(src|href)\s*=/i.test(openTag)) continue
    hashes.push(sha256(m[1]))
  }
  return hashes
}

export function buildStandaloneCsp(html: string): {
  scriptHashes: string[]
  styleHashes: string[]
  metaCsp: string
  headerCsp: string
} {
  const scriptHashes = collectHashes(html, 'script')
  const styleHashes = collectHashes(html, 'style')
  const scriptSrc = ["script-src 'self'", ...scriptHashes].join(' ')
  const styleSrc = ["style-src 'self'", ...styleHashes].join(' ')
  const base = `default-src 'self'; ${scriptSrc}; ${styleSrc}; ${SHARED_DIRECTIVES}`
  // <meta> CSP ignores frame-ancestors; the nginx header carries it.
  return { scriptHashes, styleHashes, metaCsp: base, headerCsp: `${base} frame-ancestors 'self';` }
}

export function injectMeta(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  // First in <head> so it governs every inline script/style that follows.
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => `${h}${meta}`)
  return `${meta}${html}`
}

/**
 * Vite plugin: after the single-file build has inlined all CSS/JS, compute the
 * SHA-256 of each inline script/style, inject a hash-based <meta> CSP into the
 * HTML (so the offline file:// and GitHub Pages copies are self-protecting), and
 * emit `csp-standalone.conf` so the nginx `/zonder-account/` block can serve the
 * same hash-based CSP header (and drop `'unsafe-inline'`).
 */
export function cspHashPlugin(): Plugin {
  return {
    name: 'csp-hash-standalone',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'asset' || !chunk.fileName.endsWith('.html')) continue
        const html = chunk.source as string
        // Guard against plugin-ordering bugs: if CSS/JS is not yet inlined the
        // hashes would be wrong, so fail loudly. (The inlined favicon <link
        // rel="icon" href="data:…"> is fine — only external script/stylesheet
        // references mean inlining has not happened yet.)
        if (/<script\b[^>]*\ssrc\s*=/i.test(html) || /<link\b[^>]*stylesheet[^>]*>/i.test(html)) {
          this.error('csp-hash-standalone must run after the single-file inlining (found an external script/stylesheet).')
        }
        const { metaCsp, headerCsp } = buildStandaloneCsp(html)
        chunk.source = injectMeta(html, metaCsp)
        this.emitFile({
          type: 'asset',
          fileName: 'csp-standalone.conf',
          source: `add_header Content-Security-Policy "${headerCsp}" always;\n`,
        })
      }
    },
  }
}

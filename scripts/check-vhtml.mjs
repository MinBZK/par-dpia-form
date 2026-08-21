#!/usr/bin/env node
// Regression guard for the Trusted Types / v-html gap (see security review).
//
// Vue's v-html is NOT covered by the app's Trusted Types `default` DOMPurify
// policy: Vue registers its own no-op `vue` policy and routes every innerHTML
// assignment through it, so the browser never falls back to the default policy
// for v-html sinks. Every v-html therefore relies on the *call site* sanitising
// its input (escapeHtml/stripHtml or the markdown allowlist renderer). The same
// applies to raw `innerHTML`/`outerHTML`/`insertAdjacentHTML` assignments in
// plain `.ts` code, which is why those are scanned here too.
//
// This guard pins the set of reviewed HTML sinks to a committed baseline. Any
// NEW sink - a site not in the baseline - fails CI. Adding one is then a
// deliberate act: sanitise the input, then run `check:vhtml --write-baseline`,
// and the baseline diff is where a reviewer confirms the new sink is safe.
//
// Baseline key format: `file::kind::expr` for most sinks, and
// `file::kind::expr::body:<hash>` when `expr` is a bare identifier that
// resolves to a local `const`/`let` declaration in the same file (typically a
// `computed(...)`). The hash is a sha256 of that declaration's initializer, so
// rewriting the computed - e.g. removing the call to a sanitizer - changes the
// key and fails CI even though the v-html expression text (`renderedHtml`)
// stayed the same. This is the deepest gap the previous version had: pinning
// only the expression text let a reviewed sink go unsanitised silently after a
// refactor. It does NOT protect sinks whose expression is a prop or a property
// path (e.g. `task.description`, `option.label`) - those are not local
// declarations, so there is nothing in this file to hash, and a caller could
// still pass unsanitised data in from outside. Nor does it detect a *new*
// unsafe sanitizer function reused under the same name after a rename. It is a
// pragmatic tripwire, not a data-flow proof.
//
// standalone-form is in scope too: unlike the CSP inline-style guard, it does
// not run under an 'unsafe-inline' CSP (see build/cspHashPlugin.ts - a
// per-build sha256 hash allowlist), so a new sink there is just as much a
// regression as one in the other apps.

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated'])
const TARGETS = [
  'apps/boekhouding-frontend/src',
  'apps/standalone-form/src',
  'packages/assessment-core/src',
]
const BASELINE_REL = 'scripts/vhtml-baseline.json'

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/

// Extract every v-html binding (with its expression) from SFC markup. Scans
// the whole file text (not line by line) so a binding whose expression spans
// multiple lines is still found as a single match, with the line number of
// where the binding starts.
export function extractVHtmlBindings(content) {
  const out = []
  const re = /v-html\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>][^\s>]*))/g
  let m
  while ((m = re.exec(content)) !== null) {
    const expr = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    const line = content.slice(0, m.index).split('\n').length
    out.push({ line, kind: 'v-html', expr })
  }
  return out
}

// Extract `v-bind="{ ...innerHTML: expr... }"` object bindings - a way to
// smuggle an innerHTML sink past a naive `v-html=` scan.
export function extractVBindInnerHtmlBindings(content) {
  const out = []
  const re = /v-bind\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(content)) !== null) {
    const value = (m[1] ?? m[2] ?? '').trim()
    if (!/\binnerHTML\b/.test(value)) continue
    const line = content.slice(0, m.index).split('\n').length
    out.push({ line, kind: 'v-bind', expr: value })
  }
  return out
}

// Extract raw DOM HTML-sink assignments/calls: `.innerHTML =`, `.outerHTML =`,
// `.insertAdjacentHTML(...)`. These are not gated by Vue's v-html policy at
// all, and can appear in both `.ts` and `.vue` files.
export function extractDomHtmlSinks(content) {
  const out = []
  const patterns = [
    { kind: 'innerHTML', re: /\.innerHTML\s*=(?!=)\s*([^;\n]+)/g },
    { kind: 'outerHTML', re: /\.outerHTML\s*=(?!=)\s*([^;\n]+)/g },
    { kind: 'insertAdjacentHTML', re: /\.insertAdjacentHTML\s*\(([^)]*)\)/g },
  ]
  for (const { kind, re } of patterns) {
    let m
    while ((m = re.exec(content)) !== null) {
      const expr = m[1].trim()
      const line = content.slice(0, m.index).split('\n').length
      out.push({ line, kind, expr })
    }
  }
  return out
}

function extractAllBindings(content) {
  return [
    ...extractVHtmlBindings(content),
    ...extractVBindInnerHtmlBindings(content),
    ...extractDomHtmlSinks(content),
  ]
}

// From the character index right after `identifier = `, extract the
// initializer text: if it opens with `(`, `{` or `[`, take the balanced
// bracket span (covers `computed(() => { ... })`, object/array literals);
// otherwise fall back to everything up to the next blank line. Pragmatic, not
// a real parser - good enough to notice a rewritten computed body.
function extractBalancedInitializer(text, start) {
  let i = start
  while (i < text.length && /\s/.test(text[i])) i++
  const opens = '({['
  const closes = ')}]'
  if (opens.includes(text[i])) {
    let depth = 0
    let j = i
    for (; j < text.length; j++) {
      if (opens.includes(text[j])) depth++
      else if (closes.includes(text[j])) {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    return text.slice(i, j)
  }
  let j = i
  while (j < text.length && !(text[j] === '\n' && text[j + 1] === '\n')) j++
  return text.slice(i, j)
}

// Resolve a bare identifier to a local `const`/`let` declaration in this file
// and return a short hash of its initializer, or null if none is found (e.g.
// the identifier is a prop, not a local declaration).
export function resolveDeclarationHash(content, identifier) {
  if (!IDENTIFIER_RE.test(identifier)) return null
  const declRe = new RegExp(`(?:^|\\n)\\s*(?:const|let)\\s+${identifier}\\s*=\\s*`)
  const m = declRe.exec(content)
  if (!m) return null
  const start = m.index + m[0].length
  const body = extractBalancedInitializer(content, start)
  if (!body.trim()) return null
  return createHash('sha256').update(body).digest('hex').slice(0, 12)
}

// Sites present now but not accounted for in the baseline multiset.
export function findUnlistedBindings(currentKeys, baselineKeys) {
  const remaining = new Map()
  for (const key of baselineKeys) remaining.set(key, (remaining.get(key) ?? 0) + 1)
  const unlisted = []
  for (const key of currentKeys) {
    const n = remaining.get(key) ?? 0
    if (n > 0) remaining.set(key, n - 1)
    else unlisted.push(key)
  }
  return unlisted
}

function collectFiles(absPath) {
  const st = statSync(absPath)
  if (st.isFile()) return ['.vue', '.ts'].includes(extname(absPath)) ? [absPath] : []
  const out = []
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      out.push(...collectFiles(join(absPath, entry.name)))
    } else if (['.vue', '.ts'].includes(extname(entry.name))) {
      out.push(join(absPath, entry.name))
    }
  }
  return out
}

function buildKey(rel, content, binding) {
  const base = `${rel}::${binding.kind}::${binding.expr}`
  const hash = resolveDeclarationHash(content, binding.expr)
  return hash ? `${base}::body:${hash}` : base
}

// Collect current sites as `file::kind::expr[::body:hash]` keys, relative to
// the repo root.
export function collectCurrentSites(root) {
  const sites = []
  for (const target of TARGETS) {
    const abs = join(root, target)
    if (!existsSync(abs)) continue
    for (const file of collectFiles(abs)) {
      const rel = file.slice(root.length).replace(/\\/g, '/')
      const content = readFileSync(file, 'utf8')
      for (const b of extractAllBindings(content)) {
        sites.push(buildKey(rel, content, b))
      }
    }
  }
  return sites.sort()
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const baselinePath = join(root, BASELINE_REL)
  const current = collectCurrentSites(root)

  if (process.argv.includes('--write-baseline')) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n')
    console.log(`✓ Wrote ${current.length} HTML sink(s) to ${BASELINE_REL}`)
    return
  }

  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8'))
    : []
  const unlisted = findUnlistedBindings(current, baseline)

  if (unlisted.length === 0) {
    console.log(`✓ v-html guard: ${current.length} site(s), all in the reviewed baseline.`)
    return
  }

  console.error(`✗ v-html guard: ${unlisted.length} new HTML sink(s) not in the baseline.\n`)
  console.error('v-html/innerHTML is NOT sanitised by Trusted Types here - the call site must')
  console.error('sanitise its input (escapeHtml/stripHtml or the markdown allowlist). Once you')
  console.error('have, run `pnpm check:vhtml --write-baseline` and review the baseline diff.\n')
  for (const key of unlisted) {
    const [file, kind, ...rest] = key.split('::')
    console.error(`  ${file}  ${kind}="${rest.join('::')}"`)
  }
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

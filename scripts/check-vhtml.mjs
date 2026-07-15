#!/usr/bin/env node
// Regression guard for the Trusted Types / v-html gap (see security review).
//
// Vue's v-html is NOT covered by the app's Trusted Types `default` DOMPurify
// policy: Vue registers its own no-op `vue` policy and routes every innerHTML
// assignment through it, so the browser never falls back to the default policy
// for v-html sinks. Every v-html therefore relies on the *call site* sanitising
// its input (escapeHtml/stripHtml or the markdown allowlist renderer).
//
// This guard pins the set of reviewed v-html sinks to a committed baseline. Any
// NEW v-html — a site not in the baseline — fails CI. Adding one is then a
// deliberate act: sanitise the input, then run `check:vhtml --write-baseline`,
// and the baseline diff is where a reviewer confirms the new sink is safe.
//
// The standalone-form is out of scope (single-file build, 'unsafe-inline' CSP);
// its shared components live in assessment-core, which IS scanned here.

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated'])
const TARGETS = ['apps/boekhouding-frontend/src', 'packages/assessment-core/src']
const BASELINE_REL = 'scripts/vhtml-baseline.json'

// Extract every v-html binding (with its expression) from SFC markup.
export function extractVHtmlBindings(content) {
  const out = []
  const lines = content.split('\n')
  const re = /v-html\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(lines[i])) !== null) {
      out.push({ line: i + 1, expr: (m[1] ?? m[2] ?? '').trim() })
    }
  }
  return out
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

function collectVueFiles(absPath) {
  const st = statSync(absPath)
  if (st.isFile()) return extname(absPath) === '.vue' ? [absPath] : []
  const out = []
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      out.push(...collectVueFiles(join(absPath, entry.name)))
    } else if (extname(entry.name) === '.vue') {
      out.push(join(absPath, entry.name))
    }
  }
  return out
}

// Collect current sites as `file::expr` keys, relative to the repo root.
export function collectCurrentSites(root) {
  const sites = []
  for (const target of TARGETS) {
    const abs = join(root, target)
    if (!existsSync(abs)) continue
    for (const file of collectVueFiles(abs)) {
      const rel = file.slice(root.length).replace(/\\/g, '/')
      for (const b of extractVHtmlBindings(readFileSync(file, 'utf8'))) {
        sites.push(`${rel}::${b.expr}`)
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
    console.log(`✓ Wrote ${current.length} v-html site(s) to ${BASELINE_REL}`)
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

  console.error(`✗ v-html guard: ${unlisted.length} new v-html sink(s) not in the baseline.\n`)
  console.error('v-html is NOT sanitised by Trusted Types here — the call site must sanitise')
  console.error('its input (escapeHtml/stripHtml or the markdown allowlist). Once you have,')
  console.error('run `pnpm check:vhtml --write-baseline` and review the baseline diff.\n')
  for (const key of unlisted) {
    const [file, expr] = key.split('::')
    console.error(`  ${file}  v-html="${expr}"`)
  }
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

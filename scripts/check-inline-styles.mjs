#!/usr/bin/env node
// Regression guard for issue #326 (CSP hardening).
//
// The boekhouding-frontend ships `style-src 'self'` (no 'unsafe-inline'), so any
// inline style that reaches the DOM as a *parsed* style — a literal `style=`
// attribute, a `<style>` element in served HTML, or a `style=` inside v-html
// content — is blocked by the browser. Dynamic values are routed through CSS
// classes and `--custom-properties` instead (see base.css / app.css).
//
// This guard fails CI when a CSP-unsafe inline style is (re)introduced in the
// strict-CSP surfaces. It allows the sanctioned escape hatch: a `:style` binding
// that only sets custom properties (Vue applies those via the CSSOM, which CSP
// does not gate, and the cascade lives in a 'self' stylesheet).
//
// The standalone-form is intentionally out of scope: it is built as a single
// inlined file (viteSingleFile) and served with 'unsafe-inline'.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKUP_EXTS = new Set(['.vue', '.html'])
const SCRIPT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'])
const YAML_EXTS = new Set(['.yaml', '.yml'])

// A `:style` value is allowed only when it is an object literal whose every key
// is a CSS custom property (`--foo`). Anything we cannot prove is custom-prop
// only (a variable, a string, a mixed object) is conservatively rejected.
function isCustomPropertyOnlyBinding(value) {
  const v = value.trim()
  if (!v.startsWith('{') || !v.endsWith('}')) return false
  const inner = v.slice(1, -1).trim()
  if (inner === '') return false
  const customPropEntries =
    /^(?:(['"])--[\w-]+\1\s*:\s*[^,{}]+)(?:\s*,\s*(['"])--[\w-]+\2\s*:\s*[^,{}]+)*\s*,?\s*$/
  return customPropEntries.test(inner)
}

export function findInlineStyleViolations(content, ext) {
  const violations = []
  const lines = content.split('\n')
  const add = (lineIdx, reason, line) =>
    violations.push({ line: lineIdx + 1, reason, snippet: line.trim().slice(0, 120) })

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (MARKUP_EXTS.has(ext)) {
      // Literal `style=` attribute (preceded by whitespace or `<`, never `:`).
      if (/(^|[\s<])style\s*=\s*["']/.test(line)) {
        add(i, 'literal style= attribute (move it to a CSS class)', line)
      }
      // Dynamic `:style` / `v-bind:style` bindings.
      const dynRe = /(?::|v-bind:)style\s*=\s*"([^"]*)"|(?::|v-bind:)style\s*=\s*'([^']*)'/g
      let m
      while ((m = dynRe.exec(line)) !== null) {
        const value = m[1] ?? m[2] ?? ''
        if (!isCustomPropertyOnlyBinding(value)) {
          add(i, ':style binding with a non-custom-property value (use a class or a --custom-property)', line)
        }
      }
      // A `<style>` element only matters in served static HTML; in a `.vue` SFC
      // it is compiled to a 'self' CSS asset.
      if (ext === '.html' && /<style[\s>]/i.test(line)) {
        add(i, '<style> element in static HTML', line)
      }
    }

    if (YAML_EXTS.has(ext)) {
      if (/(^|[\s<])style\s*=\s*["']/.test(line)) {
        add(i, 'inline style= in content (rendered via v-html)', line)
      }
    }

    if (SCRIPT_EXTS.has(ext)) {
      if (/\.setAttribute\(\s*['"]style['"]/.test(line)) {
        add(i, "setAttribute('style', …) writes the style attribute", line)
      }
      if (/\.cssText\s*=[^=]/.test(line)) {
        add(i, '.cssText assignment writes the style attribute', line)
      }
    }
  }
  return violations
}

// --- CLI -------------------------------------------------------------------

const CHECK_EXTS = new Set([...MARKUP_EXTS, ...SCRIPT_EXTS, ...YAML_EXTS])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated', 'test', '__tests__'])

// Strict-CSP surfaces only. standalone-form is excluded by design.
const TARGETS = [
  'apps/boekhouding-frontend/src',
  'apps/boekhouding-frontend/index.html',
  'packages/assessment-core/src',
  'sources',
]

function collectFiles(absPath, root) {
  const st = statSync(absPath)
  if (st.isFile()) return CHECK_EXTS.has(extname(absPath)) ? [absPath] : []
  const out = []
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      out.push(...collectFiles(join(absPath, entry.name), root))
    } else if (CHECK_EXTS.has(extname(entry.name))) {
      out.push(join(absPath, entry.name))
    }
  }
  return out
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const findings = []
  for (const target of TARGETS) {
    const abs = join(root, target)
    let files
    try {
      files = collectFiles(abs, root)
    } catch {
      continue // optional target (e.g. sources/) absent in this checkout
    }
    for (const file of files) {
      const violations = findInlineStyleViolations(readFileSync(file, 'utf8'), extname(file))
      for (const v of violations) findings.push({ file: file.slice(root.length), ...v })
    }
  }

  if (findings.length === 0) {
    console.log('✓ CSP inline-style guard: no CSP-unsafe inline styles found.')
    return
  }

  console.error(`✗ CSP inline-style guard: ${findings.length} violation(s) found.\n`)
  console.error('These would break `style-src \'self\'` (issue #326). Move them to a')
  console.error('CSS class, or — for a dynamic value — a `--custom-property`.\n')
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.reason}`)
    console.error(`      ${f.snippet}`)
  }
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

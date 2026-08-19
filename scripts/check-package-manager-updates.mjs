#!/usr/bin/env node
// Monitor: flag when a newer pnpm or corepack is published than the pinned one.
//
// Dependabot cannot see these versions (they live in `RUN` lines / the
// packageManager field, not a manifest it parses), so this scheduled check
// fills the gap: it reads the pinned versions, compares them to the npm
// registry, and prints a report. A workflow turns the report into a tracking
// issue. It is NOT a CI gate and never fails the build; on a network error it
// reports "nothing behind" rather than spamming a false issue.

import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pins can appear as `pnpm@X.Y.Z` (Containerfile / packageManager field) or
// `corepack@X.Y.Z` (Containerfile install line).
const PIN_RE = /\b(pnpm|corepack)@(\d+\.\d+\.\d+)/g

// name -> sorted array of distinct pinned versions found across the repo.
export function collectPins(texts) {
  const pins = new Map()
  for (const text of texts) {
    for (const [, name, ver] of text.matchAll(PIN_RE)) {
      if (!pins.has(name)) pins.set(name, new Set())
      pins.get(name).add(ver)
    }
  }
  return new Map([...pins].map(([n, set]) => [n, [...set].sort(compareVersions)]))
}

// Compare X.Y.Z strings: negative if a<b, positive if a>b, 0 if equal.
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

// The lowest pinned version is the one that gates whether we are behind.
export function behindEntries(pins, latest) {
  const out = []
  for (const [name, versions] of pins) {
    const newest = latest[name]
    if (!newest) continue
    const lowest = versions[0]
    if (compareVersions(lowest, newest) < 0) {
      out.push({ name, pinned: versions, latest: newest })
    }
  }
  return out
}

// --- IO (only the CLI touches the filesystem / network) --------------------

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git'])

function collectTexts(root) {
  const texts = []
  const pkg = join(root, 'package.json')
  if (existsSync(pkg)) texts.push(readFileSync(pkg, 'utf8'))
  const containers = join(root, 'containers')
  if (existsSync(containers)) walk(containers, texts)
  return texts
}

function walk(dir, texts) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, texts)
    } else if (entry.name.startsWith('Containerfile')) {
      texts.push(readFileSync(p, 'utf8'))
    }
  }
}

async function latestVersion(pkg) {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
  if (!res.ok) throw new Error(`registry responded ${res.status}`)
  return (await res.json()).version
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const pins = collectPins(collectTexts(root))

  const latest = {}
  try {
    for (const name of pins.keys()) latest[name] = await latestVersion(name)
  } catch (err) {
    console.log(`Could not reach the npm registry (${err.message}); skipping this run.`)
    setOutput('behind', 'false')
    return
  }

  const behind = behindEntries(pins, latest)
  if (behind.length === 0) {
    console.log('All package-manager pins are current:')
    for (const [name, versions] of pins) console.log(`- ${name}: ${versions.join(', ')} (latest ${latest[name]})`)
    setOutput('behind', 'false')
    return
  }

  console.log('## Package-manager updates available\n')
  console.log('A newer version is published than the one pinned in this repo. Bump the pin(s) below (regenerate the pnpm `+sha512` hash with `corepack use pnpm@<version>`), then merge.\n')
  for (const { name, pinned, latest: newest } of behind) {
    console.log(`- **${name}**: pinned \`${pinned.join('`, `')}\` -> latest \`${newest}\``)
  }
  setOutput('behind', 'true')
}

function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `${key}=${value}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}

#!/usr/bin/env node
// Guard for the security headers nginx sends with every response.
//
// Two surfaces answer on the same origin: nginx serves the SPA and the static
// standalone form, the Fastify backend serves /api. A header added to one and
// forgotten on the other is invisible in review and survives for months --
// X-Permitted-Cross-Domain-Policies did exactly that, sent by @fastify/helmet
// from the start and missing from nginx until #538.
//
// BASELINE is the reviewed answer to "what does each surface send, and where
// they differ, why". The check holds the nginx snippet to it. Widening or
// weakening a header means editing BASELINE, which shows up in a diff.
//
// The backend column is not read from a running app on purpose: booting it
// needs Postgres, which this guard deliberately does not. Reproduce it with
// `app.inject()` against apps/boekhouding-backend/src/app.ts when helmet is
// upgraded.
//
// Scope: what nginx emits, not what reaches the browser. The ZAD ingress adds
// headers of its own and replaces Strict-Transport-Security with a stricter
// value carrying `preload`, so a green check here is not a statement about the
// response a user gets. Read those off a deployed environment.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SNIPPET_REL = 'containers/frontend/nginx/snippets/security-headers.conf'

// `backend` is what @fastify/helmet emits with the options in app.ts, verified
// by injecting a request. null means the surface does not send the header.
export const BASELINE = [
  {
    header: 'X-Content-Type-Options',
    nginx: 'nosniff',
    backend: 'nosniff',
  },
  {
    header: 'X-Frame-Options',
    nginx: 'SAMEORIGIN',
    backend: 'SAMEORIGIN',
  },
  {
    header: 'Referrer-Policy',
    nginx: 'strict-origin-when-cross-origin',
    backend: 'no-referrer',
    why: 'The SPA needs the origin on cross-origin navigation to Keycloak; the API answers XHR only, so helmet\'s stricter default costs it nothing.',
  },
  {
    header: 'Permissions-Policy',
    nginx:
      'accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()',
    backend: null,
    why: 'Browser feature policy applies to documents; the API returns JSON only. helmet does not set it.',
  },
  {
    header: 'Cross-Origin-Opener-Policy',
    nginx: 'same-origin',
    backend: 'same-origin',
  },
  {
    header: 'Cross-Origin-Resource-Policy',
    nginx: 'same-origin',
    backend: 'same-origin',
  },
  {
    header: 'Strict-Transport-Security',
    nginx: 'max-age=31536000; includeSubDomains',
    backend: 'max-age=31536000; includeSubDomains',
  },
  {
    header: 'X-Permitted-Cross-Domain-Policies',
    nginx: 'none',
    backend: 'none',
  },
  {
    header: 'Origin-Agent-Cluster',
    nginx: '?1',
    backend: '?1',
    why:
      'Keyed per origin, and the first document decides, so the backend\'s copy on JSON responses did nothing until nginx sent it too. Not memory protection: MDN is explicit that a browser may honour it with threads rather than processes, or ignore it. What it does enforce is that document.domain, and postMessage of SharedArrayBuffer / WebAssembly.Memory / WebAssembly.Module to same-site cross-origin pages, stop working -- APIs this app does not use and now cannot start using by accident.',
  },
]

// Headers helmet sends that nginx deliberately does not. Listed so that the
// asymmetry is a documented decision rather than an oversight, and so a helmet
// upgrade that starts sending something new is noticed here first.
export const BACKEND_ONLY = ['X-DNS-Prefetch-Control', 'X-Download-Options', 'X-XSS-Protection']

// Content-Security-Policy is intentionally absent from BASELINE: it describes
// one particular document, so it lives per route in csp-app.conf and
// csp-standalone.conf, and the API's own policy differs again.
const CSP = 'Content-Security-Policy'

const ADD_HEADER = /^\s*add_header\s+(?:"([^"]+)"|(\S+))\s+"([^"]*)"\s+always\s*;/

export function parseSnippet(content) {
  const headers = new Map()
  const withoutAlways = []

  for (const line of content.split('\n')) {
    if (/^\s*#/.test(line) || !/^\s*add_header/.test(line)) continue
    const match = ADD_HEADER.exec(line)
    if (!match) {
      withoutAlways.push(line.trim())
      continue
    }
    headers.set(match[1] ?? match[2], match[3])
  }

  return { headers, withoutAlways }
}

export function findHeaderViolations(content) {
  const violations = []
  const { headers, withoutAlways } = parseSnippet(content)

  // Without `always`, nginx drops the header on error responses -- the 404s and
  // 405s that a prober is most likely to see.
  for (const line of withoutAlways) {
    violations.push({ reason: `add_header without a quoted value and \`always\`: ${line}` })
  }

  for (const { header, nginx } of BASELINE) {
    if (nginx === null) continue
    const actual = headers.get(header)
    if (actual === undefined) {
      violations.push({ header, reason: 'in BASELINE but not sent by nginx' })
    } else if (actual !== nginx) {
      violations.push({ header, reason: `value differs from BASELINE\n    baseline: ${nginx}\n    snippet:  ${actual}` })
    }
  }

  const known = new Set(BASELINE.map((e) => e.header))
  for (const header of headers.keys()) {
    if (header === CSP) {
      violations.push({ header, reason: 'belongs in csp-app.conf / csp-standalone.conf, not in the shared snippet' })
    } else if (!known.has(header)) {
      violations.push({ header, reason: 'sent by nginx but absent from BASELINE -- add it, with the backend column filled in' })
    }
  }

  return violations
}

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findHeaderViolations(readFileSync(join(repoRoot, SNIPPET_REL), 'utf8'))

  if (violations.length > 0) {
    console.error(`${SNIPPET_REL} does not match the reviewed baseline:\n`)
    for (const { header, reason } of violations) {
      console.error(`  ${header ? `${header}: ` : ''}${reason}`)
    }
    console.error('\nIntentional? Update BASELINE in scripts/check-security-headers.mjs in the same commit.')
    process.exit(1)
  }

  console.log(`${SNIPPET_REL}: ${BASELINE.filter((e) => e.nginx !== null).length} headers match the baseline.`)
}

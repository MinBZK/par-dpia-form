#!/usr/bin/env node
// Guard for the frontend runtime config that nginx serves at /config.json.
//
// The file is world-readable by design: it only carries OIDC discovery data
// (issuer URL, realm, and a *public* client id, which per RFC 6749 §2.1 has no
// secret) plus a relative URL. External scanners flag it as an "exposed config
// file"; SECURITY.md documents it as a known non-finding.
//
// That promise only holds as long as nobody adds a secret to it later, which is
// exactly what this guard pins down. Every key must be on the allowlist below,
// so widening the file is a deliberate act that shows up in a reviewed diff.
//
// Adding a legitimate field means: extend ALLOWED_KEYS here, extend AppConfig in
// apps/boekhouding-frontend/src/config.ts, and add the env var to the frontend
// Containerfile and docs/deployment.md.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE_REL = 'containers/frontend/nginx/config.json.template'

// Keys the served config may contain. `_public` is a self-documenting pointer
// for anyone who opens the file (a scanner triager, an auditor); every other key
// maps 1:1 onto a field of AppConfig.
export const DOC_KEY = '_public'
export const REQUIRED_KEYS = ['keycloakUrl', 'keycloakRealm', 'keycloakClientId', 'standaloneUrl']
export const ALLOWED_KEYS = [DOC_KEY, ...REQUIRED_KEYS]

// Names that have no business in a publicly served file. Matched against both
// the JSON key and the substituted env var, so `"clientSecret": "${OIDC_URL}"`
// and `"extra": "${OIDC_CLIENT_SECRET}"` both fail.
const SECRET_NAME =
  /(secret|password|passwd|passphrase|token|credential|private[_-]?key|api[_-]?key|apikey)/i

// envsubst placeholder, e.g. `${OIDC_URL}`. A config value must be exactly one
// placeholder: a literal would silently pin one environment's value into the
// image, which is the bug that runtime config exists to prevent.
const PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/

export function findRuntimeConfigViolations(content) {
  const violations = []
  const add = (reason, key) => violations.push(key ? { key, reason } : { reason })

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    add(`not valid JSON: ${err.message}`)
    return violations
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    add('root value is not a JSON object')
    return violations
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (SECRET_NAME.test(key)) {
      add('key name suggests a secret — /config.json is served publicly', key)
      continue
    }
    if (!ALLOWED_KEYS.includes(key)) {
      add(`key is not on the allowlist (${ALLOWED_KEYS.join(', ')})`, key)
      continue
    }
    if (typeof value !== 'string') {
      add('value is not a string', key)
      continue
    }
    if (key === DOC_KEY) {
      if (PLACEHOLDER.test(value)) add('doc field must be a literal, not an env placeholder', key)
      continue
    }
    const match = PLACEHOLDER.exec(value)
    if (!match) {
      add('value must be a single ${ENV_VAR} placeholder', key)
      continue
    }
    if (SECRET_NAME.test(match[1])) {
      add(`env var ${match[1]} suggests a secret — /config.json is served publicly`, key)
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) add('required key is missing', key)
  }

  return violations
}

// --- CLI -------------------------------------------------------------------

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const violations = findRuntimeConfigViolations(readFileSync(join(root, TEMPLATE_REL), 'utf8'))

  if (violations.length === 0) {
    console.log(`✓ runtime config guard: ${TEMPLATE_REL} holds public values only.`)
    return
  }

  console.error(`✗ runtime config guard: ${violations.length} violation(s) in ${TEMPLATE_REL}.\n`)
  console.error('This file is served publicly at /config.json, so it must never carry')
  console.error('a secret. See SECURITY.md for why it is public by design.\n')
  for (const v of violations) {
    console.error(v.key ? `  ${v.key}: ${v.reason}` : `  ${v.reason}`)
  }
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}

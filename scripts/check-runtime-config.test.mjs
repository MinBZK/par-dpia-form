import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findRuntimeConfigViolations, ALLOWED_KEYS } from './check-runtime-config.mjs'

const VALID = JSON.stringify({
  _public: 'This configuration is public by design, see SECURITY.md',
  keycloakUrl: '${OIDC_URL}',
  keycloakRealm: '${OIDC_REALM}',
  keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
  standaloneUrl: '${STANDALONE_URL}',
})

test('accepts the documented shape', () => {
  assert.deepEqual(findRuntimeConfigViolations(VALID), [])
})

test('accepts a template without the optional doc field', () => {
  const noDoc = JSON.stringify({
    keycloakUrl: '${OIDC_URL}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  assert.deepEqual(findRuntimeConfigViolations(noDoc), [])
})

// The point of the guard: a new field cannot ride along unreviewed.
test('flags a key that is not on the allowlist', () => {
  const extra = JSON.stringify({
    keycloakUrl: '${OIDC_URL}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
    matomoSiteId: '${MATOMO_SITE_ID}',
  })
  const violations = findRuntimeConfigViolations(extra)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].key, 'matomoSiteId')
  assert.match(violations[0].reason, /allowlist/)
})

test('flags a secret-looking key before the allowlist check', () => {
  const withSecret = JSON.stringify({
    keycloakUrl: '${OIDC_URL}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
    clientSecret: '${OIDC_CLIENT_SECRET}',
  })
  const violations = findRuntimeConfigViolations(withSecret)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /suggests a secret/)
})

// A secret can also arrive under an innocent key name, so the env var is checked
// on its own.
test('flags a secret-looking env var under an allowlisted key', () => {
  const sneaky = JSON.stringify({
    keycloakUrl: '${KEYCLOAK_ADMIN_PASSWORD}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  const violations = findRuntimeConfigViolations(sneaky)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].key, 'keycloakUrl')
  assert.match(violations[0].reason, /suggests a secret/)
})

// A literal would pin one environment's value into the image, defeating the
// build-once-deploy-many setup this template exists for.
test('flags a literal value where a placeholder is required', () => {
  const literal = JSON.stringify({
    keycloakUrl: 'https://keycloak.rijksapp.nl',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  const violations = findRuntimeConfigViolations(literal)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /placeholder/)
})

test('flags a partially interpolated value', () => {
  const mixed = JSON.stringify({
    keycloakUrl: '${OIDC_URL}/auth',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  assert.equal(findRuntimeConfigViolations(mixed).length, 1)
})

test('flags a non-string value', () => {
  const nested = JSON.stringify({
    keycloakUrl: { url: '${OIDC_URL}' },
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  const violations = findRuntimeConfigViolations(nested)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not a string/)
})

test('flags a missing required key', () => {
  const incomplete = JSON.stringify({
    keycloakUrl: '${OIDC_URL}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
  })
  const violations = findRuntimeConfigViolations(incomplete)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].key, 'standaloneUrl')
  assert.match(violations[0].reason, /missing/)
})

test('flags a doc field that is an env placeholder', () => {
  const docPlaceholder = JSON.stringify({
    _public: '${PUBLIC_NOTE}',
    keycloakUrl: '${OIDC_URL}',
    keycloakRealm: '${OIDC_REALM}',
    keycloakClientId: '${OIDC_PUBLIC_CLIENT_ID}',
    standaloneUrl: '${STANDALONE_URL}',
  })
  const violations = findRuntimeConfigViolations(docPlaceholder)
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /literal/)
})

test('reports invalid JSON once, without further checks', () => {
  const violations = findRuntimeConfigViolations('{ "keycloakUrl": }')
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not valid JSON/)
})

test('rejects a non-object root', () => {
  const violations = findRuntimeConfigViolations('["${OIDC_URL}"]')
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /not a JSON object/)
})

test('the allowlist stays in lockstep with AppConfig', () => {
  assert.deepEqual(ALLOWED_KEYS, [
    '_public',
    'keycloakUrl',
    'keycloakRealm',
    'keycloakClientId',
    'standaloneUrl',
  ])
})

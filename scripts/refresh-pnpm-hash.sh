#!/usr/bin/env bash
# Refresh the +sha512 integrity hash in package.json's `packageManager` field
# after Renovate bumps the pnpm version.
#
# Renovate's native packageManager handling can drop the hash when it bumps the
# version (renovatebot/renovate#29184), leaving e.g. `pnpm@11.14.0`. corepack
# then fails closed. `corepack use pnpm@<version>` rewrites the field with the
# correct hash; Renovate runs this as a postUpgradeTask and commits the result
# (package.json only, per fileFilters) into the same PR.
#
# Best-effort: on any failure it logs and exits 0 (leaving the field as Renovate
# left it - no worse than before), so it can never abort Renovate's PR.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 0

ver="$(node -p "((require('./package.json').packageManager||'').match(/^pnpm@([^+]+)/)||[])[1]||''" 2>/dev/null)"
if [ -z "$ver" ]; then
  echo "refresh-pnpm-hash: no pnpm packageManager version found, nothing to do" >&2
  exit 0
fi

# corepack ships with the runner's Node, but pin-install it if absent.
command -v corepack >/dev/null 2>&1 || npm install --global corepack@0.35.0 >/dev/null 2>&1 || true

# Rewrites `packageManager` to `pnpm@<ver>+sha512.<hash>`.
if COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack use "pnpm@${ver}" >/dev/null 2>&1; then
  echo "refresh-pnpm-hash: refreshed packageManager hash for pnpm@${ver}"
else
  echo "refresh-pnpm-hash: 'corepack use pnpm@${ver}' failed; leaving field as-is" >&2
fi
exit 0

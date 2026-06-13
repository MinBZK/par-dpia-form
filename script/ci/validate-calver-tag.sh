#!/usr/bin/env bash
# Validate that a tag matches the project's CalVer scheme: vYYYY.M.D[.MICRO],
# with month and day written without a leading zero. Shared by release.yaml and
# deploy-productie.yaml so both enforce exactly the same format.
#
# Usage: validate-calver-tag.sh <tag>
set -euo pipefail

tag="${1:?usage: validate-calver-tag.sh <tag>}"

# Valid:   v2026.6.6, v2026.12.31, v2026.6.6.1
# Invalid: v2026.06.06 (no padding), v2026.13.1 (month > 12), v0.1.3 (old SemVer)
regex='^v[0-9]{4}\.(1[0-2]|[1-9])\.(3[01]|[12][0-9]|[1-9])(\.[0-9]+)?$'
if ! printf '%s\n' "$tag" | grep -Eq "$regex"; then
  echo "Tag ${tag} voldoet niet aan CalVer (vYYYY.M.D[.MICRO])." >&2
  echo "Voorbeeld: v2026.6.6 of v2026.6.6.1." >&2
  exit 1
fi

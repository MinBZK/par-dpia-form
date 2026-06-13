#!/usr/bin/env bash
# Print the CHANGELOG.md section for a release tag/version to stdout, and exit
# non-zero when that section is missing or empty. Shared by release.yaml (which
# turns it into the GitHub release notes) and deploy-productie.yaml (which uses
# it as a gate: no documented release, no production deploy).
#
# Usage: changelog-section.sh <tag-or-version> [changelog-path]
set -euo pipefail

tag="${1:?usage: changelog-section.sh <tag-or-version> [changelog-path]}"
changelog="${2:-CHANGELOG.md}"
version="${tag#v}"

section="$(awk -v ver="$version" '
  $0 ~ "^## \\[" ver "\\]" { flag = 1; next }
  flag && /^## \[/ { exit }
  flag { print }
' "$changelog")"

if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "Geen changelog-sectie gevonden voor ${version}." >&2
  echo "Voeg een sectie '## [${version}]' toe aan ${changelog}." >&2
  exit 1
fi

printf '%s\n' "$section"

#!/usr/bin/env bash
# Print the highest CalVer tag in the repository, or nothing when there is none.
# That tag is what production runs, so it is both the downgrade guard's yardstick
# and the image the weekly security digest has to scan.
#
# Requires the tags to be present locally (checkout with fetch-depth: 0 and
# fetch-tags: true). Older SemVer tags (v0.1.x) are ignored: they do not match
# the CalVer pattern.
#
# Usage: newest-calver-tag.sh
set -euo pipefail

regex='^v[0-9]{4}\.(1[0-2]|[1-9])\.(3[01]|[12][0-9]|[1-9])(\.[0-9]+)?$'

git tag | grep -E "$regex" | sort -V | tail -n1 || true

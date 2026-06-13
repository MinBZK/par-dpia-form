#!/usr/bin/env bash
# Guard production against downgrades. Production is forward-only: the tag being
# deployed must be the highest CalVer tag in the repository. A fix for a live
# problem is shipped as a new, higher tag — never by deploying an older tag,
# which would roll production back to old code.
#
# Requires the tags to be present locally (checkout with fetch-depth: 0 and
# fetch-tags: true). Older SemVer tags (v0.1.x) are ignored: they do not match
# the CalVer pattern.
#
# Usage: assert-newest-calver-tag.sh <tag>
set -euo pipefail

tag="${1:?usage: assert-newest-calver-tag.sh <tag>}"
regex='^v[0-9]{4}\.(1[0-2]|[1-9])\.(3[01]|[12][0-9]|[1-9])(\.[0-9]+)?$'

newest="$(git tag | grep -E "$regex" | sort -V | tail -n1 || true)"

# No existing CalVer tags (first release) or this tag is the newest: allow.
if [ -z "$newest" ] || [ "$tag" = "$newest" ]; then
  exit 0
fi

echo "Tag ${tag} is niet de nieuwste CalVer-tag (${newest})." >&2
echo "Een oudere tag naar productie deployen is een downgrade en wordt geblokkeerd." >&2
echo "Breng een fix uit als nieuwe, hogere CalVer-release in plaats van een oude tag te deployen." >&2
exit 1

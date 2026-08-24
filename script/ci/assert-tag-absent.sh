#!/usr/bin/env bash
# Refuse to cut a release for a tag that already exists. Retagging is what the
# downgrade guard is built to distrust, so cut-release.yaml stops here with a
# clear message instead of letting `git tag` fail halfway through.
#
# Requires the tags to be present locally (checkout with fetch-depth: 0 and
# fetch-tags: true).
#
# Usage: assert-tag-absent.sh <tag>
set -euo pipefail

tag="${1:?usage: assert-tag-absent.sh <tag>}"

# refs/tags/<tag> rather than a tag-list grep: an exact ref lookup, so a tag
# cannot be masked or matched by another tag that merely contains its name.
if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
  echo "Tag ${tag} bestaat al." >&2
  echo "Een bestaande tag opnieuw zetten is geen release; breng een fix uit onder een nieuwe, hogere CalVer-tag." >&2
  exit 1
fi

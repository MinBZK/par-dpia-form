#!/usr/bin/env bash
# Guard that publiccode.yml carries the version of the release being cut. The
# file is metadata for open source catalogues, so it has to be committed before
# the tag is set — see step 1 of the release skill. Under CalVer the version is
# the date, so releaseDate follows from the tag as well; a micro suffix
# (v2026.6.20.1) keeps the same date.
#
# Usage: assert-publiccode-version.sh <tag> [publiccode-path]
set -euo pipefail

tag="${1:?usage: assert-publiccode-version.sh <tag> [publiccode-path]}"
file="${2:-publiccode.yml}"
expected_version="${tag#v}"

if [ ! -f "$file" ]; then
  echo "Publiccode-bestand ${file} niet gevonden." >&2
  exit 1
fi

read -r year month day _ <<<"$(echo "${expected_version}" | tr '.' ' ')"
if [ -z "${day:-}" ]; then
  echo "Tag ${tag} bevat geen CalVer-datum (verwacht vYYYY.M.D)." >&2
  exit 1
fi
expected_date="$(printf '%04d-%02d-%02d' "$year" "$month" "$day")"

# python3 rather than a YAML parser: the repo already depends on Python for CI,
# and these are two top-level scalars.
read -r actual_version actual_date <<<"$(python3 - "$file" <<'PY'
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()


def scalar(key: str) -> str:
    match = re.search(rf'^{key}:\s*"?([^"\n]+)"?\s*$', text, re.MULTILINE)
    return match.group(1).strip() if match else "-"


print(scalar("softwareVersion"), scalar("releaseDate"))
PY
)"

fail=0
if [ "$actual_version" != "$expected_version" ]; then
  echo "softwareVersion ${actual_version} in ${file} komt niet overeen met tag ${tag} (verwacht ${expected_version})." >&2
  fail=1
fi
if [ "$actual_date" != "$expected_date" ]; then
  echo "releaseDate ${actual_date} in ${file} komt niet overeen met tag ${tag} (verwacht ${expected_date})." >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "Draai in de release-PR: bash script/ci/set-publiccode-version.sh ${tag}" >&2
  exit 1
fi

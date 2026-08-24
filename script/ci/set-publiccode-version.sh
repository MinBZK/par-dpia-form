#!/usr/bin/env bash
# Set softwareVersion and releaseDate in publiccode.yml to the release being
# cut, the counterpart of assert-publiccode-version.sh. Run this in the release
# PR, before the tag is set.
#
# Usage: set-publiccode-version.sh <tag> [publiccode-path]
set -euo pipefail

tag="${1:?usage: set-publiccode-version.sh <tag> [publiccode-path]}"
file="${2:-publiccode.yml}"
version="${tag#v}"

read -r year month day _ <<<"$(echo "${version}" | tr '.' ' ')"
if [ -z "${day:-}" ]; then
  echo "Tag ${tag} bevat geen CalVer-datum (verwacht vYYYY.M.D)." >&2
  exit 1
fi
date="$(printf '%04d-%02d-%02d' "$year" "$month" "$day")"

python3 - "$file" "$version" "$date" <<'PY'
import re
import sys

path, version, date = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path, encoding="utf-8").read()

for key, value in (("softwareVersion", version), ("releaseDate", date)):
    text, count = re.subn(
        rf'^{key}:.*$', f'{key}: "{value}"', text, count=1, flags=re.MULTILINE
    )
    if count == 0:
        sys.exit(f"Geen {key}-veld in {path}.")

open(path, "w", encoding="utf-8").write(text)
PY

echo "publiccode.yml op ${version} (${date}) gezet."

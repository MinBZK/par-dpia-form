#!/usr/bin/env bash
# Guard that the assessments plugin carries the version of the release being
# cut. The plugin is consumed straight from the working tree (the marketplace
# source is a relative path), so its version has to be committed before the tag
# is set — see step 1 of the release skill. This guard catches the case where
# that step was forgotten, so the plugin cannot silently keep an old version
# while the app moves on.
#
# Usage: assert-plugin-version.sh <tag> [manifest-path]
set -euo pipefail

tag="${1:?usage: assert-plugin-version.sh <tag> [manifest-path]}"
manifest="${2:-.claude/plugins/assessments/.plugin/plugin.json}"
expected="${tag#v}"

if [ ! -f "$manifest" ]; then
  echo "Plugin-manifest ${manifest} niet gevonden." >&2
  exit 1
fi

# python3 rather than jq: the repo already depends on Python for CI, jq would be
# a new one.
actual="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version",""))' "$manifest")"

if [ -z "$actual" ]; then
  echo "Geen version-veld in ${manifest}." >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "Plugin-versie ${actual} komt niet overeen met tag ${tag} (verwacht ${expected})." >&2
  echo "Draai in de release-PR: python3 .claude/plugins/assessments/scripts/generate_plugin.py --set-version ${expected}" >&2
  exit 1
fi

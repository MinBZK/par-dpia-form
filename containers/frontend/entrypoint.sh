#!/bin/sh
# set -eu: a crash here is more visible than nginx silently serving an empty
# or absent rendered file.
set -eu
envsubst < /etc/nginx/config.json.template > /tmp/config.json

# Baked into the image at build time (see the Containerfile), not computed here.
SECURITY_TXT_EXPIRES="$(cat /etc/security-txt-expires)"
export SECURITY_TXT_EXPIRES

# PUBLIC_HOST can be a comma-separated list with a trailing slash (see
# parseCorsOrigin in the backend config); ${PUBLIC_HOST:-} avoids an unbound-
# variable abort under `set -u` when it is unset entirely.
SECURITY_TXT_CANONICAL_HOST="${PUBLIC_HOST:-}"
SECURITY_TXT_CANONICAL_HOST="${SECURITY_TXT_CANONICAL_HOST%%,*}"
SECURITY_TXT_CANONICAL_HOST="${SECURITY_TXT_CANONICAL_HOST%/}"
export SECURITY_TXT_CANONICAL_HOST

# Canonical is optional per RFC 9116, so an unset PUBLIC_HOST drops the line
# instead of serving it empty or half-finished.
if [ -z "$SECURITY_TXT_CANONICAL_HOST" ]; then
    echo "WARNING: PUBLIC_HOST is not set; serving security.txt without a Canonical line." >&2
    envsubst < /etc/nginx/security.txt.template | grep -v '^Canonical:' > /tmp/security.txt
else
    envsubst < /etc/nginx/security.txt.template > /tmp/security.txt
fi

exec nginx -g 'daemon off;'

ARG BASE
FROM ${BASE}
ARG TAG=dev
ARG COMMIT=dev
USER root
RUN printf '{"version":"%s","commit":"%s","channel":"productie"}\n' "$TAG" "$COMMIT" > /usr/share/nginx/html/version.json
# The standalone form bakes its version into the single-file HTML at build time,
# when the CalVer tag isn't known yet. Patch the baked "ontwikkel (commit <sha>)"
# marker with the release tag so /zonder-account/ shows the same version as the
# status page.
# sed exits 0 on a pattern that matches nothing, so assert the marker is there
# before patching: a silent no-op ships "ontwikkel (commit <sha>)" to production,
# and promotion is the only place this runs, so nothing else would catch it.
RUN set -eu; \
    grep -q "ontwikkel (commit [0-9a-f]\{7\})" /usr/share/nginx/html/zonder-account/index.html \
      || { echo "Version marker not found; the standalone build changed its format." >&2; exit 1; }; \
    sed -i "s|ontwikkel (commit [0-9a-f]\{7\})|${TAG}|g" /usr/share/nginx/html/zonder-account/index.html
USER 101

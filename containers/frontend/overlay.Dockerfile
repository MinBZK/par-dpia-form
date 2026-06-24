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
RUN sed -i "s|ontwikkel (commit [0-9a-f]\{7\})|${TAG}|g" /usr/share/nginx/html/zonder-account/index.html
USER 101

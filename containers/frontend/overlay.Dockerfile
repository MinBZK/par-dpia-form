ARG BASE
FROM ${BASE}
ARG TAG=dev
ARG COMMIT=dev
USER root
RUN printf '{"version":"%s","commit":"%s","channel":"productie"}\n' "$TAG" "$COMMIT" > /usr/share/nginx/html/version.json
USER 101

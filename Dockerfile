# Stage 1: Generate JSON from YAML definitions
FROM python:3.12-slim AS generator

WORKDIR /app

COPY sources/ sources/
COPY schemas/ schemas/
COPY script/ script/

RUN pip install --no-cache-dir pyyaml jsonschema && \
    mkdir -p form-app/src/assets && \
    python script/run_all.py \
      --schema schemas/formSchema.json \
      --source sources/prescan_DPIA.yaml \
      --begrippen-yaml sources/begrippenkader-dpia.yaml \
      --output-json form-app/src/assets/PreScanDPIA.json \
      --output-md /dev/null && \
    python script/run_all.py \
      --schema schemas/formSchema.json \
      --source sources/DPIA.yaml \
      --begrippen-yaml sources/begrippenkader-dpia.yaml \
      --output-json form-app/src/assets/DPIA.json \
      --output-md /dev/null

# Stage 2: Build Vue application
FROM node:20-slim AS builder

WORKDIR /app

COPY form-app/package.json form-app/package-lock.json ./
RUN npm ci

COPY form-app/ .
COPY --from=generator /app/form-app/src/assets/*.json src/assets/

RUN npm run build

# Stage 3: Serve with nginx
FROM ghcr.io/rijksictgilde/nginx-base:2026.03.0 AS release

COPY --from=builder /app/dist/ /usr/share/nginx/html/

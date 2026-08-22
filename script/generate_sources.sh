#!/usr/bin/env bash
# Renders the YAML question definitions to the JSON the frontend builds against.
# Shared by the image build and the image scan so the two cannot drift.
set -euo pipefail

mkdir -p sources/generated

uv run --frozen --no-dev python script/run_all.py \
  --schema schemas/assessment-definition.v2.schema.json \
  --source sources/prescan.yaml \
  --begrippen-yaml sources/begrippenkader_dpia.yaml \
  --output-json sources/generated/PreScanDPIA.json \
  --output-md docs/questions/questions_prescan.md

uv run --frozen --no-dev python script/run_all.py \
  --schema schemas/assessment-definition.v2.schema.json \
  --source sources/dpia.yaml \
  --begrippen-yaml sources/begrippenkader_dpia.yaml \
  --output-json sources/generated/DPIA.json \
  --output-md docs/questions/questions_DPIA.md

uv run --frozen --no-dev python script/run_all.py \
  --schema schemas/assessment-definition.v2.schema.json \
  --source sources/iama.yaml \
  --begrippen-yaml sources/begrippenkader_iama.yaml \
  --output-json sources/generated/IAMA.json \
  --definitions-once-per-page

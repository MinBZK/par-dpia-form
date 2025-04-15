> [!IMPORTANT]
> This repository is work in progress.

# par-dpia-form

This repository contains forms to fill in the (pre scan) DPIA form.

## High level overview

The restrictions imposed on the project are that the forms must be accessible *without any installation
or hosting*. A standalone HTML file with all necessary styling and javascript embedded in it fulfills
this requirement and was hence chosen as a suitable, albeit nonstandard, solution.

Form definitions are declared in YAML. A Vue 3 application loads these YAML definitions and renders
the form. Users can provide answers, export their progress into a JSON file, load their saved JSON state
into the application and export the questions and answers to a PDF report.

# YAML Validator and Definition Enricher

Tools for validating YAML files against JSON schemas and enriching content with tooltip definitions.

### Components

- `schema_validator.py` - Validates YAML files against JSON schemas
- `sync_begrippenkader.py` - Manages the glossary (begrippenkader) 
- `definition_enricher.py` - Enriches data with tooltip definitions
- `run_sync_validate_and_inject.py` - Combines all functionalities

### Form Definitions

The `sources/` directory contains DPIA form specifications:
- `DPIA.yaml` - Tasks within the DPIA
- `prescan_DPIA.yaml` - Tasks within the pre-scan DPIA 
- `begrippenkader.yaml` - Glossary items

JSON-schemas are in the `schemas/` directory.

## Usage

### Schema Validation

```bash
# DPIA
python script/schema_validator.py --schema schemas/schema_DPIA.json --source sources/DPIA.yaml --output form-app/src/assets/DPIA.json

# Prescan DPIA
python script/schema_validator.py --schema schemas/schema_DPIA.json --source sources/prescan_DPIA.yaml --output form-app/src/assets/PreScanDPIA.json
```


### Definition Enrichment

```bash
# DPIA
python script/definition_enricher.py --source sources/DPIA.yaml --definitions sources/begrippenkader.yaml --output form-app/src/assets/DPIA.json

# Prescan DPIA
python script/definition_enricher.py --source sources/prescan_DPIA.yaml --definitions sources/begrippenkader.yaml --output form-app/src/assets/PreScanDPIA.json
```

### Combined Workflow

```bash
# DPIA
python script/run_sync_validate_and_inject.py \
  --schema schemas/schema_DPIA.json \
  --source sources/DPIA.yaml \
  --begrippen-yaml sources/begrippenkader.yaml \
  --output form-app/src/assets/DPIA.json \
  --[--skip-validation] \


# Prescan DPIA
python script/run_sync_validate_and_inject.py \
  --schema schemas/schema_DPIA.json \
  --source sources/prescan_DPIA.yaml \
  --begrippen-yaml sources/begrippenkader.yaml \
  --output form-app/src/assets/PreScanDPIA.json \
  --[--skip-validation] \

```


## Pre Scan DPIA Form

TODO

## DPIA Form

The DPIA form can be downloaded from here: [DPIA form](form-app/dist/index.html). This is a user interface to fill in the DPIA form.
Because it is a standalone HTML file no installation is needed and it can be rendered in any browser.

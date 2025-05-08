# par-dpia-form
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow.svg)](https://github.com/MinBZK/par-dpia-form)
[![License: EUPL v1.2](https://img.shields.io/badge/License-EUPL_v1.2-blue.svg)](LICENSE)

A standalone web application for completing Data Protection Impact Assessments (DPIA) and Pre-scan DPIAs, following the Dutch government's Rijksmodel DPIA framework.

## Introduction
The PAR-DPIA-Form project provides a browser-based tool for completing Pre-scan DPIA and DPIA forms and generating reports without requiring installation or server hosting. 
The Pre-scan DPIA form help organizations evaluate privacy risks associated with data processing activities and determine whether a full DPIA, DTIA (Data Transfer Impact Assessment), IAMA (Impact Assessment Mensenrechten en Algoritmes), or KIA (Kinderrechten Impact Assessment) is necessary.

Key features:

- Complete DPIA and Pre-scan DPIA forms directly in your browser.
- Save progress as a JSON file that can be shared with colleagues.
- Continue work from previously saved sessions.
- Export completed forms as PDF.
- No installation or hosting required.

This repository contains 

- [Pre-scan DPIA form specification](sources/prescan_DPIA.yaml), [DPIA form specification](sources/DPIA.yaml) and 
a [glossary](sources/begrippenkader-dpia.yaml), all in YAML format. These YAML's adhere to schemas
defined [here](schemas/schema_DPIA.json) and are described in the [form standard specification](form_standard.md).
- A [Vue application](form-app/) to fill in these forms and export them to an intermediate JSON format, or 
PDF document.
- The application as a single [HTML file](form-app/dist/index.html) which is served via [GitHub Pages](https://minbzk.github.io/par-dpia-form/).


## High level overview

The restrictions imposed on the project are that the forms must be accessible *without any installation
or hosting*. A standalone HTML file with all necessary styling and javascript embedded in it fulfills
this requirement and was hence chosen as a suitable, albeit nonstandard, solution. This HTML file is served
via [GitHub Pages](https://minbzk.github.io/par-dpia-form/).

Form definitions are declared in YAML. A Vue 3 application loads these YAML definitions and renders
the form. Users can provide answers, export their progress into a JSON file, load their saved JSON state
into the application and export the questions and answers to a PDF report.

## Vue App

### Running locally

1. Clone the repository:

```bash
git clone https://github.com/MinBZK/par-dpia-form.git 
cd par-dpia-form
```

2. Install dependencies:

```bash
cd form-app
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to the URL specified in the output of the above command.

### Building the application

This project uses `vite-plugin-singlefile` to build the single HTML file that can be deployed anywhere:

```bash
cd form-app
npm run build
```

This will generate a standalone HTML file at `form-app/dist/index.html` that contains all necessary CSS,
JavaScript and assets. There is a GitHub Action that deploys this to GitHub Pages when a branch is merged 
to the main branch.

### Technical details

#### Key technologies

- Vue 3: Frontend framework with Composition API
- TypeScript: Type-safe JavaScript
- Pinia: Vue State management
- PDF Make: PDF generation
- Vite: Build tool
- RVO Design System: UI components and styling

#### State management

The application uses Pinia stores to manage:

- Form tasks and instances (`TaskStore`)
- User answers (`AnswerStore`)
- Form schemas (`SchemaStore`)
- Auto-calculated results (`CalculationStore`)


#### Persistence

User progress is saved:

- Locally in browser local storage for the current session.
- As downloadable JSON files for long-term storage and sharing.

## Scripts

Tools for validating YAML files against JSON schemas and enriching content with tooltip definitions.

### Prerequisites

Install `uv`, a Python package manager:

```bash 
curl -LsSf https://astral.sh/uv/install.sh | sh
```
or see instructions on the [uv website](https://docs.astral.sh/uv/getting-started/installation/).

### Components

- `schema_validator.py` - Validates YAML files against JSON schemas
- `sync_begrippenkader.py` - Manages the glossary (begrippenkader) 
- `definition_enricher.py` - Enriches data with tooltip definitions
- `run_sync_validate_and_inject.py` - Combines all functionalities

### Form Definitions

The `sources/` directory contains DPIA form specifications:
- `DPIA.yaml` - Tasks within the DPIA
- `prescan_DPIA.yaml` - Tasks within the pre-scan DPIA 
- `begrippenkader-dpia.yaml` - Glossary items

JSON-schemas are in the `schemas/` directory.

### Usage

#### Schema Validation
Validates the YAML against a schema and optionally exports the validated schema to a JSON. In the examples
below the schema is validated and exported to a JSON in the assets folder of the frontend application.

#### Prescan DPIA

```bash
uv run script/schema_validator.py \
    --schema schemas/formSchema.json \
    --source sources/prescan_DPIA.yaml \
    --output form-app/src/assets/PreScanDPIA.json
```

#### DPIA

```bash
uv run script/schema_validator.py \
    --schema schemas/formSchema.json \
    --source sources/DPIA.yaml \
    --output form-app/src/assets/DPIA.json
```


#### Definition Enrichment

This script injects glossary items from the glossary in the source YAML. It injects glossary items as certain HTML elements with certain styling
which can be rendered by the frontend application.

#### Prescan DPIA

```bash
uv run script/definition_enricher.py \
    --source sources/prescan_DPIA.yaml \
    --definitions sources/begrippenkader-dpia.yaml \
    --output form-app/src/assets/PreScanDPIA.json
```

#### DPIA

```bash
uv run script/definition_enricher.py \
    --source sources/DPIA.yaml \
    --definitions sources/begrippenkader-dpia.yaml \
    --output form-app/src/assets/DPIA.json
```

#### Combined Workflow

This script combines the two above scripts to validate the script, inject glossary items and export them to a JSON.

#### Prescan DPIA

```bash
uv run script/run_validate_and_inject.py \
  --schema schemas/formSchema.json \
  --source sources/prescan_DPIA.yaml \
  --begrippen-yaml sources/begrippenkader-dpia.yaml \
  --output form-app/src/assets/PreScanDPIA.json
```

#### DPIA

```bash
uv run script/run_validate_and_inject.py \
  --schema schemas/formSchema.json \
  --source sources/DPIA.yaml \
  --begrippen-yaml sources/begrippenkader-dpia.yaml \
  --output form-app/src/assets/DPIA.json
```


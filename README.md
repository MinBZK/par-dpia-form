# par-dpia-form
[![Status: Beta](https://img.shields.io/badge/Status-Beta-yellow.svg)](https://github.com/MinBZK/par-dpia-form)
[![License: EUPL v1.2](https://img.shields.io/badge/License-EUPL_v1.2-blue.svg)](LICENSE)

A standalone web application for completing Data Protection Impact Assessments (DPIA), Pre-scan DPIAs, and Impact Assessments Mensenrechten en Algoritmes (IAMA), following the Dutch government's Rijksmodel DPIA framework.

## Introduction

The PAR-DPIA-Form project provides a browser-based tool for completing Pre-scan DPIA, DPIA and IAMA forms and generating reports without requiring installation or server hosting.
The Pre-scan DPIA form helps organizations evaluate privacy risks associated with data processing activities and determine whether a full DPIA, DTIA (Data Transfer Impact Assessment), IAMA (Impact Assessment Mensenrechten en Algoritmes), or KIA (Kinderrechten Impact Assessment) is necessary.

## Key features

- 🌐 Complete DPIA, Pre-scan DPIA, and IAMA forms directly in your browser.
- 💾 Save progress as a JSON file that can be shared with colleagues.
- ⏱️ Continue work from previously saved sessions.
- 📄 Export completed forms as PDF.
- 📦 No installation or hosting required.

## High level overview

The restrictions imposed on the project are that the forms must be accessible *without any installation
or hosting*. A standalone HTML file with all necessary styling and javascript embedded in it fulfills
this requirement and was hence chosen as a suitable, albeit nonstandard, solution. This HTML file is served
via [GitHub Pages](https://minbzk.github.io/par-dpia-form/).

Form definitions are declared in YAML. A Vue 3 application loads these YAML definitions and renders
the form. Users can provide answers, export their progress into a JSON file, load their saved JSON state
into the application and export the questions and answers to a PDF report.

## Repository structure

```
par-dpia-form/
├── .github/                            # GitHub-specific configurations
│   ├── workflows/                      # GitHub Actions workflow definitions
│   │   ├── build.yaml                  # CI workflow - verify builds
│   │   └── release-and-deploy.yaml     # Release triggered deployments
│   └── dependabot.yaml                 # Dependency update configuration
│
├── form-app/                           # Main Vue application
│   ├── src/                            # Source code
│   │   ├── assets/                     # Generated JSON files
│   │   ├── components/                 # Vue components
│   │   ├── models/                     # TypeScript data models
│   │   ├── stores/                     # Pinia state management
│   │   └── utils/                      # Helper utilities
│   ├── dist/                           # Build output
│   │   └── index.html                  # Standalone application file
│   └── package.json                    # NPM dependencies
│
├── schemas/                            # JSON schemas for validation
│   └── formSchema.json                 # Form structure schema
|
├── docs/                               # Docs for all documentation
│   ├── PDR/                            # Folder for all Product Decision Records (PDR)
│   └── standard/                       # Folder for info on standard
│   └── questions/                      # Folder with tables with questions
│
├── script/                             # Processing and validation scripts
│   ├── schema_validator.py             # Validates YAML against schema
│   ├── definition_enricher.py          # Adds tooltips to form definitions
│   ├── convert_definitions_from_AK.py  # Syncs definitions from Algoritmekader
│   ├── generate_md_table_questions.py  # Generates MD tables with questions
│   └── run_all.py                      # Combined processing workflow
│
├── sources/                            # Source YAML definitions
│   ├── DPIA.yaml                       # Full DPIA form definition
│   ├── prescan_DPIA.yaml               # Pre-scan DPIA definition
│   ├── IAMA.yaml                       # IAMA form definition
│   ├── begrippenkader-dpia.yaml        # Glossary for DPIA/Pre-scan (synced from J&V)
│   └── begrippenkader-iama.yaml        # Glossary for IAMA (synced from Algoritmekader)
│
├── LICENSE                             # EUPL v1.2 License
├── README.md                           # Project documentation
```

The application flows from the YAML source definitions (in `/sources`), through the processing
scripts (in `/script`), into the Vue application (in `/form-app`),
and ultimately produces a standalone HTML file that can be used without installation.


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
JavaScript and assets. There is a GitHub Action that deploys this to GitHub Pages when a release is created.

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
- `definition_enricher.py` - Enriches data with tooltip definitions
- `convert_definitions_from_AK.py` - Downloads and converts definitions from the [Algoritmekader](https://github.com/MinBZK/Algoritmekader) begrippenlijst into YAML
- `run_all.py` - Combines all functionalities

### Form Definitions

The `sources/` directory contains form specifications:
- `DPIA.yaml` - Tasks within the DPIA
- `prescan_DPIA.yaml` - Tasks within the pre-scan DPIA
- `IAMA.yaml` - Tasks within the IAMA
- `begrippenkader-dpia.yaml` - Glossary items for DPIA/Pre-scan (synced from [J&V](https://modellen.jenvgegevens.nl/dpia/begrippenkader-dpia.yaml))
- `begrippenkader-iama.yaml` - Glossary items for IAMA (synced from [Algoritmekader](https://github.com/MinBZK/Algoritmekader/blob/main/includes/begrippenlijst.md))

JSON-schemas are in the `schemas/` directory.

### Usage

#### Schema Validation
Validates the YAML against a schema and optionally exports the validated schema to a JSON. In the examples
below the schema is validated and exported to a JSON in the assets folder of the frontend application.

##### Prescan DPIA

```bash
uv run script/schema_validator.py \
    --schema schemas/formSchema.json \
    --source sources/prescan_DPIA.yaml \
    --output form-app/src/assets/PreScanDPIA.json
```

##### DPIA

```bash
uv run script/schema_validator.py \
    --schema schemas/formSchema.json \
    --source sources/DPIA.yaml \
    --output form-app/src/assets/DPIA.json
```

##### IAMA

```bash
uv run script/schema_validator.py \
    --schema schemas/formSchema.json \
    --source sources/IAMA.yaml \
    --output form-app/src/assets/IAMA.json
```

#### Definition Enrichment

This script injects glossary items from the glossary in the source YAML. It injects glossary items as certain HTML elements with certain styling
which can be rendered by the frontend application.

##### Prescan DPIA

```bash
uv run script/definition_enricher.py \
    --source sources/prescan_DPIA.yaml \
    --definitions sources/begrippenkader-dpia.yaml \
    --output form-app/src/assets/PreScanDPIA.json
```

##### DPIA

```bash
uv run script/definition_enricher.py \
    --source sources/DPIA.yaml \
    --definitions sources/begrippenkader-dpia.yaml \
    --output form-app/src/assets/DPIA.json
```

##### IAMA

```bash
uv run script/definition_enricher.py \
    --source sources/IAMA.yaml \
    --definitions sources/begrippenkader-iama.yaml \
    --output form-app/src/assets/IAMA.json
```

#### Syncing Algoritmekader Definitions

Downloads the latest definitions from the Algoritmekader begrippenlijst and converts them to YAML:

```bash
uv run script/convert_definitions_from_AK.py --output sources/begrippenkader-iama.yaml
```

This is also run automatically by the GitHub Actions sync workflow.

#### YAML to Markdown Table Converter
This script generates a well-structured Markdown table from YAML form definition files. It extracts all tasks, their types, options, and relationships to provide a comprehensive overview of the form structure. The table includes the original task IDs, the task text (with visual hierarchy), answer types, available options, and related tasks.

The DPIA tasks can be checked [here](docs/tasks/tasks_DPIA.md) and the Pre-scan DPIA tasks can be checked [here](docs/tasks/tasks_prescan_DPIA.md).

##### Prescan DPIA

```bash
uv run script/generate_md_table_tasks.py \
  --source sources/prescan_DPIA.yaml \
  --output docs/tasks/tasks_prescan_DPIA.md
```

##### DPIA

```bash
uv run script/generate_md_table_tasks.py \
  --source sources/DPIA.yaml \
  --output docs/tasks/tasks_DPIA.md
```

#### Combined Workflow

This script combines the three above scripts to:
1. Validate the script and export them to a JSON
2. Inject glossary items and export them to a JSON
3. Create tasks markdown documents

##### Prescan DPIA

```bash
uv run script/run_all.py \
  --schema schemas/formSchema.json \
  --source sources/prescan_DPIA.yaml \
  --begrippen-yaml sources/begrippenkader-dpia.yaml \
  --output-json form-app/src/assets/PreScanDPIA.json \
  --output-md docs/questions/questions_prescan_DPIA.md
```

##### DPIA

```bash
uv run script/run_all.py \
  --schema schemas/formSchema.json \
  --source sources/DPIA.yaml \
  --begrippen-yaml sources/begrippenkader-dpia.yaml \
  --output-json form-app/src/assets/DPIA.json \
  --output-md docs/questions/questions_DPIA.md
```

##### IAMA

```bash
uv run script/run_all.py \
  --schema schemas/formSchema.json \
  --source sources/IAMA.yaml \
  --begrippen-yaml sources/begrippenkader-iama.yaml \
  --output-json form-app/src/assets/IAMA.json \
  --output-md docs/questions/questions_IAMA.md
```

## Known Limitations

While we strive to make this application as robust as possible, there are some known limitations in the current implementation:

### Testing Coverage
- The application currently lacks comprehensive automated testing
- Unit tests, component tests, and end-to-end tests need to be implemented
- Future work should include test coverage reporting and minimum thresholds

### Schema Management
- Schema versioning is not fully implemented for form definitions
- There is no automated migration path between different schema versions
- Forms created with older schema versions may not be compatible with newer application versions
- Schema evolution strategy needs to be formalized for long-term maintenance

### Media Handling
- File or image uploading is not currently supported in form inputs
- No storage mechanism exists for handling uploaded media
- Future versions could integrate with file storage solutions or implement base64 encoding for simple use cases

### Performance Considerations
- The application may experience performance issues with very large or complex forms
- All form data is stored in memory and as a single file, which may not scale for enterprise use cases
- No backend persistence layer is implemented for multi-user collaboration due to the restrictions posed on this project.

### Accessibility
- While the application uses the RVO design system which has accessibility features, comprehensive accessibility testing has not been performed
- WCAG compliance has not been formally verified

### Browser Compatibility
- The application is primarily tested on modern browsers
- Compatibility with older browsers or mobile devices may vary

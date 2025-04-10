> [!IMPORTANT]
> This repository is work in progress.

# par-dpia-form
This repository contains forms to fill in the (pre scan) DPIA form.

## Form definitions
The `sources/` directory contains the speficications of the (Pre Scan) DPIA Forms and the logic
on how fields within the forms are related. Currently, only the DPIA is implemented. The `DPIA.yaml`
file contains the tasks within the DPIA, the `DPIA_field_mapping.yaml` contains the way tasks are
related and the `begrippenkader.yaml` contains glossary items.

The JSON-schema specification of `sources/DPIA.yaml` and `sources/DPIA_field_mapping.yaml` can be found
the `schemas/` directory.

The Python script `script/validate` can be used the validate the YAML's agains their schema and insert the definitions. It can be
invoked, for example using UV, by
```
uv run --with jsonschema --with pyyaml script/validate --schema schemas/schema_DPIA.json --source sources/DPIA.yaml --definitions sources/begrippenkader.yaml --output form-app/src/assets/DPIA.json
```
This will validate the DPIA yaml and export it in JSON format to the specified file with the definitions embedded.

In order to create the `begrippenkader.yaml` the Python script `script/sync_begrippenkader` can be used. This script takes the `sources/datamode/begrippenkader.html` as base (from the Datamodel). It can be invoked by
```
python script/sync_begrippenkader --input sources/datamodel/begrippenkader.html --output sources/begrippenkader.yaml --existing sources/begrippenkader.yaml
```

## Pre Scan DPIA Form
TODO

## DPIA Form
The DPIA form can be downloaded from here: [DPIA form](form-app/dist/index.html). This is a user interface to fill in the DPIA form.
Because it is a standalone HTML file no installation is needed and it can be rendered in any browser. 

## High level implementation overview
The restrictions imposed on the project are that the form must be accessible without any installation
or hosting. A standalone HTML file fulfills this requirement and was hence chosen as a suitable solution.
Form definitions are declared in YAML format. A simple Vue 3 application then loads this YAML and renders
the form.

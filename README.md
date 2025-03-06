# par-dpia-form

[!IMPORTANT]
This repository is work in progress.

## Form definitions
The `sources/` directory contains the speficications of the (Pre Scan) DPIA Forms and the logic
on how fields within the forms are related. Currently, only the DPIA is implemented. The `DPIA.yaml`
file contains the tasks within the DPIA, the `DPIA_field_mapping.yaml` contains the way tasks are
related and the `begrippenkader.yaml` contains glossary items.

The JSON-schema specification of `sources/DPIA.yaml` and `sources/DPIA_field_mapping.yaml` can be found
the `schemas/` directory.

The Python script `script/validate` can be used the validate the YAML's agains their schema. It can be
invoked, for example using UV, by
```
uv run --with jsonschema --with pyyaml script/validate
```

## Pre Scan DPIA Form
TODO

## DPIA Form
TODO

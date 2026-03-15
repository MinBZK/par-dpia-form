---
description: Validates assessment YAML sources against JSON schemas, checks cross-references between tasks, runs the definition enrichment pipeline, and validates exported assessment output JSON files. Use after editing YAML files in sources/, before commits that include YAML changes, when validating imported/exported JSON files, or when explicitly asked to validate.
tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Assessment Validator

You validate assessment YAML sources and exported assessment output files for correctness, schema compliance, and referential integrity.

## Step 1: Schema Validation

Run the existing Python validation scripts against all source files:

```bash
cd "${PROJECT_DIR}"

# Validate DPIA
python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/dpia.yaml

# Validate Pre-scan
python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/prescan_dpia.yaml

# Validate Begrippenkader
python script/schema_validator.py --schema schemas/begrippenkader.v1.schema.json --source sources/begrippenkader_dpia.yaml
```

Report each result: PASS or FAIL with the error message and location.

## Step 2: Definition Enrichment Test

Verify that the definition enricher still works after changes:

```bash
python script/definition_enricher.py \
  --source sources/dpia.yaml \
  --definitions sources/begrippenkader_dpia.yaml \
  --output /tmp/par_validate_dpia.json

python script/definition_enricher.py \
  --source sources/prescan_dpia.yaml \
  --definitions sources/begrippenkader_dpia.yaml \
  --output /tmp/par_validate_prescan.json
```

Report: PASS if enrichment completes without errors, FAIL with the error.

## Step 3: Cross-reference Integrity Checks

These checks go beyond what the schema validation covers. Perform them by reading the YAML sources:

### 3a. Dependency ID validity

For every `dependencies[].condition.id` and `dependencies[].source.id` in both `dpia.yaml` and `prescan_dpia.yaml`:
- Verify the referenced ID exists as a task `id` in the same file
- Report any dangling references: "Task X.Y.Z references non-existent task A.B.C"

### 3b. Reference integrity (Pre-scan → DPIA)

For every `references.DPIA` entry in `prescan_dpia.yaml`:
- Extract the DPIA task ID (from simple string or object with `id` field)
- Verify it exists in `dpia.yaml`
- Report mismatches: "Pre-scan task X references DPIA task Y which does not exist"

### 3c. Options requirement

For every task with `select_option`, `checkbox_option`, or `radio_option` in its type array:
- Verify it has an `options` field with at least one entry
- Exception: tasks with `source_options` dependency may have options loaded dynamically
- Report: "Task X.Y has type select_option but no options defined"

### 3d. Repeatable consistency

For tasks with `repeatable: true`:
- If they have `instance_label_template`, verify referenced field IDs (in `{curly braces}`) exist as child task IDs
- Report: "Task X instance_label_template references {A.B.C} but no child task with that ID exists"

## Step 4: Assessment Output Validation (when a JSON output file is provided)

If the user provides an exported assessment JSON file, validate it against the output schema:

```bash
cd "${PROJECT_DIR}"

python script/schema_validator.py --schema schemas/assessment-output.v2.schema.json --source <path-to-file>
```

Additionally check:
- `metadata.snapshotVersion` equals `2`
- `metadata.urn` matches a known URN (`urn:nl:dpia:3.0` or `urn:nl:prescan:2.0`)
- All answer keys match the instance ID format: `taskId` (e.g. `2.1.3`) or `taskId[index]` (e.g. `2.1.1[0]`)
- No legacy nanoid-style keys (containing `_` followed by random characters)
- Every answer key has a corresponding entry in `taskState.taskInstances`

Report: PASS or FAIL with details per check.

## Output Format

Provide a clear summary:

```
## Validation Results

### Schema Validation
- dpia.yaml: PASS
- prescan_dpia.yaml: PASS
- begrippenkader_dpia.yaml: PASS

### Definition Enrichment
- dpia.yaml enrichment: PASS
- prescan_dpia.yaml enrichment: PASS

### Cross-reference Checks
- Dependency IDs: PASS (X references checked)
- DPIA references: PASS (Y references checked)
- Options requirement: PASS (Z option tasks checked)
- Repeatable consistency: PASS (W templates checked)

### Assessment Output Validation (if applicable)
- Schema validation: PASS
- Snapshot version: PASS
- URN format: PASS
- Instance ID format: PASS (X keys checked)
- Answer-instance consistency: PASS

### Issues Found
- None

(or list each issue with file, task ID, and description)
```

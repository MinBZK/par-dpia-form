---
name: Assessment Schema YAML
description: Use when editing assessment YAML sources in sources/, asking about the assessment schema structure, adding tasks/fields to dpia.yaml or prescan_dpia.yaml, or working with dependencies, calculations, or references in assessment definitions.
version: 0.1.0
---

# Assessment Schema YAML

Guide for editing YAML assessment sources (`sources/dpia.yaml`, `sources/prescan_dpia.yaml`) that conform to `schemas/assessment-definition.v1.schema.json`.

## Top-level Structure

```yaml
name: "DPIA Rapportagemodel Rijksdienst"
urn: "urn:nl:dpia:3.0"           # Pattern: urn:nl:<type>:<version>
version: "3.0"
description: "..."
tasks: [...]                      # Required: array of task objects
assessments: [...]                # Optional: evaluation rules (used in prescan)
```

## Task Structure

Every task requires these fields:

```yaml
- task: "Task title"              # Required: display name
  id: "2.1.3"                    # Required: hierarchical ID, pattern ^[0-9]+(\.[0-9]+)*
  type:                           # Required: array of field types
    - open_text
  repeatable: false               # Required: boolean
```

Optional fields:
- `description`: explanation text (may contain HTML)
- `category`: grouping category
- `is_official_id`: true if ID matches the Rapportagemodel DPIA numbering
- `valueType`: expected data type (`string`, `boolean`, `number`, `string[]`, `boolean|null`)
- `defaultValue`: pre-filled value
- `options`: required when type includes `select_option`, `checkbox_option`, or `radio_option`
- `tasks`: nested child tasks (for `task_group` type)
- `dependencies`: conditional display rules
- `calculation`: score calculation logic
- `references`: cross-references to other assessments
- `sources`: external resource references (images, documents)
- `required_status`: whether the field is mandatory
- `instance_label_template`: template for repeatable instance labels (e.g. `"Gegevensverwerking {4.1.1}"`)

## Field Types

| Type | Description | Requires |
|------|-------------|----------|
| `text_input` | Single-line text | - |
| `open_text` | Multi-line text | - |
| `select_option` | Dropdown select | `options` array |
| `checkbox_option` | Multiple checkboxes | `options` array |
| `radio_option` | Radio buttons | `options` array |
| `task_group` | Container for child tasks | `tasks` array |
| `date` | Date picker | - |

A task can have multiple types (array), e.g. `[open_text, select_option]`.

## Options

```yaml
options:
  - value: "option_value"         # Required: string, boolean, or null
    label: "Display label"        # Optional: if omitted, value is shown
```

## Dependencies

Three types of dependencies control conditional behavior:

### conditional — Show/hide based on another answer

```yaml
dependencies:
  - type: conditional
    condition:
      id: "2.1.6"                # Task ID to check
      operator: equals            # equals | contains | any | all
      value: true                 # Value to match
    action: show                  # show | hide
```

### source_options — Load options dynamically from another field

```yaml
dependencies:
  - type: source_options
    condition:
      id: "2.1"                  # Source task ID
    action: options
```

### instance_mapping — Sync instances between repeatables

```yaml
dependencies:
  - type: instance_mapping
    source:
      id: "3.1"                  # Source repeatable task
    mapping_type: one_to_one      # one_to_one | one_to_many | many_to_one
    action: sync_instances
```

## Calculations (Pre-scan)

Score calculations use jexl expressions:

```yaml
calculation:
  scoreKey: "gewone_persoonsgegeven"
  expression: "answers('1.1.2') | count"
  riskScore:
    - when: "gewone_persoonsgegeven < 6"
      value: 0
    - when: "gewone_persoonsgegeven >= 6"
      value: 1
```

### Available jexl functions

- `answers('taskId')` — get the answer value for a task
- `bool(value)` — convert to boolean
- `count` — filter/transform that counts array items
- `countSelectedOptions('taskId')` — count selected checkbox options
- `weightedCountMap(answers, weightMap)` — weighted count of selected options

## References

Cross-references between Pre-scan and DPIA:

```yaml
references:
  prescanModelId: "1"             # Links to Pre-scan Model paragraph
  DPIA: "1.1"                    # Simple: links to DPIA task ID
  DPIA:                           # With type:
    - id: "1.1"
      type: "one-to-one"         # one-to-one | one-to-many | many-to-one | many-to-many
  DPIA:                           # Typed reference:
    id: "12.1.1"
    type: "pre-fill"             # pre-fill | pre-view | direct takeover
```

## Assessment Evaluation Rules (Pre-scan)

```yaml
assessments:
  - id: "DPIA"
    levels:
      - level: "required"         # required | recommended
        expression: "criteria.wetgeving || criteria.riskscore"
        result: "DPIA verplicht"
        criteria:
          - id: "wetgeving"
            expression: "bool(answers('0.1'))"
            explanation: "er sprake is van nieuwe wet- of regelgeving"
```

## ID Numbering

- Top-level sections: single number (`"0"`, `"1"`, `"2"`)
- Subsections: dot-separated (`"2.1"`, `"2.1.3"`)
- Task ID `"0"` is the introduction (not an official DPIA section)
- `is_official_id: true` means the ID corresponds to the Rapportagemodel numbering

## Validation

After editing YAML sources, validate with:

```bash
python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/dpia.yaml
python script/schema_validator.py --schema schemas/assessment-definition.v1.schema.json --source sources/prescan_dpia.yaml
```

The schema file `schemas/assessment-definition.v1.schema.json` is the source of truth. Always read it when unsure about allowed values.

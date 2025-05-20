# Form declarations for Data Protection Impact Assessment

## 1. Introduction

This document provides a standardized specification for the declaration of structured forms,
with a specific focus on Data Protection Impact Assessment (DPIA) forms. 

It defines a schema for creating hierarchical form structures that can be used for privacy-related
assessments and evaluations, including:
- Data Protection Impact Assessments (DPIAs)
- Pre-scan DPIAs for preliminary risk assessment

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in
[RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## 3. Form schema overview

### 3.1 General structure

A form is defined as a hierarchical structure of tasks.
The basic form declaration follows this pattern:

```yaml
name: "Form Name"
urn: "urn:nl:domain:version"
version: "1.0"
description: "Description of the form's purpose"
tasks:
  - task: "Task Group Name"
    id: "1"
    type:
      - task_group
    repeatable: false
    tasks:
      # Nested tasks go here
```

The root object MUST contain the following properties:

- `name`: Human-readable name of the form
- `urn`: Unique Resource Name in the format `urn:nl:domain:version`
- `version`: Version string in the format major[.minor[.patch]]
- `description`: Human-readable description of the form's purpose
- `tasks`: Array of top-level tasks

The tasks array MUST contain at least one task.

For details see Appendix A.

### 3.2 Task types

Tasks are the building blocks of forms. The following task types MUST be supported:

- `task_group`: A container for other tasks
- `text_input`: Single-line text input
- `open_text`: Multi-line text input
- `select_option`: Dropdown selection
- `checkbox_option`: Multiple-choice selection
- `radio_option`: Single-choice selection
- `date`: Date input

### 3.3 Core task properties

Each task MUST have the following properties:

- `task`: Human-readable name of the task
- `id`: Unique identifier, typically in a hierarchical format (e.g., "1.2.3")
- `type`: Array of task types as specified in 3.2
- `repeatable`: Boolean indicating if the task can be repeated

Tasks MAY have the following additional properties:

- `description`: Detailed explanation of the task
- `options`: Array of selectable options for `select_option`, `checkbox_option`, or `radio_option` tasks
- `valueType`: Expected data type of the answer (e.g., `"string"`, `"boolean"`, `"string[]"`)
- `defaultValue`: Pre-filled value that will be set as a default answer
- `dependencies`: Rules for conditional display
- `calculation`: Logic for calculating values or scores based on form input
- `instance_label_template`: Template for generating labels for repeatable tasks
- `references`: References to external systems or documents
- `sources`: References to external sources such as images


### 3.4 Advanced form features

#### 3.4.1 Conditional logic

Forms support complex conditional logic through dependencies:

```yaml
dependencies:
  - type: conditional
    condition:
      id: "3.1.6"
      operator: equals
      value: true
    action: show
```

The following operators MUST be supported:

- `equals`: Exact match
- `contains`: String/array contains value
- `any`: Any value is selected

The following actions MUST be supported:

- `show`: Display the field when condition is met

#### 3.4.2 Instance mapping

Forms support synchronizing instances between related sections:

```yaml
dependencies:
  - type: instance_mapping
    source:
      id: "4.1.1"
    mapping_type: "one_to_one"
    action: sync_instances
```

The following mapping types MUST be supported:

- `one_to_one`: One instance in source maps to one instance in target

#### 3.4.3 Dynamic options

Options can be dynamically sourced from other fields:

```yaml
dependencies:
  - type: source_options
    condition:
      id: "3.1.1"
      operator: any
    action: options
```

This allows forms to dynamically populate selection options based on values entered elsewhere in the form.


#### 3.4.4 calculations

Forms support calculation of derived values and risk scores:

```yaml
calculation:
  scoreKey: "bijzonder_persoonsgegeven"
  expression: "answers('1.2.2') | count"
  riskScore:
    - when: "bijzonder_persoonsgegeven == 0"
      value: 0
    - when: "bijzonder_persoonsgegeven >= 1 && bijzonder_persoonsgegeven <= 6"
      value: 1
    - when: "bijzonder_persoonsgegeven > 6"
      value: 2
```

Implementations MUST support the following capabilities:

- Expression evaluation using a standard expression language such as JEXL
- Custom functions for accessing form answers
- Conditional risk score assignment


#### 3.4.5 Referencing

Forms support cross-references to other form sections:

```yaml
references:
  prescanModelId: "7"
  DPIA: "13.1.1"
```

This allows implementations to provide contextual navigation and linking between related forms.


## 4. DPIA Form implementation

The DPIA Form implementation is based on the Government of the Netherlands Rijksmodel DPIA 3.0.


## 5. Pre-scan DPIA Form implementation

The Pre-scan DPIA is a preliminary assessment to determine whether a full DPIA is required.
It evaluates the potential privacy impact of data processing activities to identify high-risk
processing that necessitates a complete DPIA.


### 5.1 Risk scoring

A key feature of the Pre-scan is its scoring mechanism that calculates risk based on various factors.
For example:

```yaml
calculation:
  scoreKey: "bijzonder_persoonsgegeven"
  expression: "answers('1.2.2') | count"
  riskScore:
    - when: "bijzonder_persoonsgegeven == 0"
      value: 0
    - when: "bijzonder_persoonsgegeven >= 1 && bijzonder_persoonsgegeven <= 6"
      value: 1
    - when: "bijzonder_persoonsgegeven > 6"
      value: 2
```

These caclulations are evaluation in the frontend application uses JEXL. In this case a custom JEXL
function `answer` is called which retrieves answer "1.2.2" and is passed on the custom `count` JEXL
function which counts the number of elements contained in the array of answer "1.2.2". A `riscScore`
is computed on the basis of the described conditions.


### 5.2 Assessment results
The Pre-scan determines if additional assessments are required; these are computed from risk scoring
calculations as described in section 5.1. An assessment can have different levels, indicating whether 
it is required or recommended. For example:

```yaml
assessments:
  - id: "DPIA"
    levels:
      - level: "required"
        expression: "
          (
            (scores.gewone_persoonsgegeven || 0) +
            (scores.bijzonder_persoonsgegeven || 0) +
            # Other scores...
          ) > 4 || 
          (countSelectedOptions('3.1') >= 1) ||
          (countSelectedOptions('4.1') >= 2)"
        result: "DPIA verplicht"
        explanation: "Een DPIA is verplicht omdat ..."
      
      - level: "recommended"
        expression: "countSelectedOptions('4.1') == 1"
        result: "DPIA aanbevolen"
        explanation: "Een DPIA wordt aanbevolen omdat ..."
```


## 6. Implementation considerations

### 6.1 Validation

Implementations MUST validate form data against the schema.
Required fields MUST be enforced according to the schema definitions.

## Appendix A

The complete [form JSON schema](../../schemas/formSchema.json).

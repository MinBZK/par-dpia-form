---
name: Begrippenkader Schema YAML
description: Use when editing sources/begrippenkader_dpia.yaml or sources/begrippenkader_iama.yaml, adding or modifying definitions, asking about the begrippenkader structure or schema, or working with term definitions and their metadata.
version: 0.1.0
---

# Begrippenkader Schema YAML

Guide for editing the begrippenkader (`sources/begrippenkader_dpia.yaml`) that conforms to `schemas/begrippenkader.v1.schema.json`.

There is a second begrippenkader for the IAMA assessment, `sources/begrippenkader_iama.yaml`, used to enrich `sources/iama.yaml`. It is **generated**, not hand-edited — see [IAMA begrippenkader](#iama-begrippenkader) below.

## Top-level Structure

```yaml
schema_version: 1.0.0
name: "Begrippenkader Model DPIA Rijksdienst en Pre-scan DPIA"
description: "..."
urn: "urn:nl:begrippenkaderdpia_pre-scandpia:3.0:begrippenkader:1.0.0"
language: nl
version_date: "2025-06-01"
owners:
  - organization: "Ministerie van Binnenlandse Zaken"
    name: "CIO Rijk"
    email: "privacy-ciorijk@minbzk.nl"
    role: "Privacy Adviseurs Rijk"
definitions: [...]                # Array of definition objects
```

## Definition Structure

```yaml
- id: verwerker                   # Required: lowercase letters, digits, underscores only
  term: Verwerker                 # Required: display name with proper capitalization
  category: "DPIA - 06. Betrokken partijen"  # Required: category string
  definition: >-                  # Required: definition text
    Een verwerker is een natuurlijke persoon of rechtspersoon die
    ten behoeve van de [verwerkingsverantwoordelijke] [persoonsgegevens] verwerkt.
  metadata:                       # Optional metadata
    kennisbronnen:
      - "artikel 4, lid 8, AVG"
    toelichting: "Uitgebreide uitleg..."
    redactionele_opmerking: "Bron van deze definitie..."
    voorbeelden:
      - "Een cloudprovider die data opslaat"
    alternatieve_spellingen:
      - "processor"
    meervoudsvormen:
      - "verwerkers"
```

## ID Convention

- Pattern: `^[a-z0-9_]+$` — only lowercase letters, digits, and underscores
- Use underscores to separate words: `recht_van_inzage`, `lijst_edpb_geautomatiseerde_besluitvorming`
- Keep IDs descriptive but concise

## Categories

Categories follow these patterns:
- DPIA sections: `"DPIA - <number>. <section name>"` (e.g. `"DPIA - 06. Betrokken partijen"`)
- Pre-scan sections: `"Pre-scan DPIA - <letter>. <section name>"` (e.g. `"Pre-scan DPIA - E. Lijst EDPB"`)

## Cross-references in Definitions

Terms enclosed in `[vierkante haken]` (square brackets) within definition text reference other definitions in the begrippenkader:

```yaml
definition: >-
  Een verwerker is een natuurlijke persoon die ten behoeve van de
  [verwerkingsverantwoordelijke] [persoonsgegevens] verwerkt.
```

Here `[verwerkingsverantwoordelijke]` and `[persoonsgegevens]` link to their respective definitions. When adding new definitions, use square brackets to reference existing terms.

## Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `kennisbronnen` | string[] | Legal/document sources (e.g. "artikel 15, lid 1, AVG") |
| `toelichting` | string | Extended explanation |
| `redactionele_opmerking` | string | Editorial note about the definition's origin |
| `voorbeelden` | string[] | Concrete examples |
| `alternatieve_spellingen` | string[] | Alternative spellings (e.g. English equivalent) |
| `meervoudsvormen` | string[] | Plural forms of the term |

## Definition Enrichment Pipeline

The `script/definition_enricher.py` script processes definitions for use in the frontend:

1. Creates a term map from all definitions (including plural forms and alternative spellings)
2. Injects `<span class="aiv-definition">` HTML tags around matching terms in assessment YAML
3. Matching priority: hoofdtermen → meervoudsvormen → alternatieve spellingen → alternatieve termen
4. All matching is case-insensitive; original capitalization is preserved
5. Existing definition spans are not re-processed (no nesting)

After editing the begrippenkader, test enrichment:

```bash
python script/definition_enricher.py \
  --source sources/dpia.yaml \
  --definitions sources/begrippenkader_dpia.yaml \
  --output /tmp/test_enriched.json
```

## Schema Validation

```bash
python script/schema_validator.py \
  --schema schemas/begrippenkader.v1.schema.json \
  --source sources/begrippenkader_dpia.yaml
```

**Note:** The schema expects `glossary[]` but the actual YAML uses `definitions[]`. The schema may need updating to match. Always check the actual file structure alongside the schema.

## IAMA begrippenkader

The IAMA assessment uses a separate begrippenkader, `sources/begrippenkader_iama.yaml`, which enriches `sources/iama.yaml` (urn `urn:nl:iama`, version `2.0`).

- **Generated, not hand-edited.** It is produced from the [Algoritmekader](https://minbzk.github.io/Algoritmekader/) begrippenlijst via `script/convert_definitions_from_algoritmekader.py`. Edit the source begrippenlijst / regenerate rather than editing the YAML by hand.
- **Simpler structure** than the DPIA begrippenkader: a flat `definitions[]` list where each entry has only `term` and `definition` — no `id`, `category`, `metadata`, top-level `urn`, or `owners`.

```yaml
definitions:
  - term: aanbieder
    definition: >-
      Een natuurlijke of rechtspersoon, overheidsinstantie, agentschap of ander
      orgaan die/dat een AI-systeem ... ontwikkelt of laat ontwikkelen ...
```

Regenerate with:

```bash
python script/convert_definitions_from_algoritmekader.py --output sources/begrippenkader_iama.yaml
```

When generating `sources/generated/IAMA.json`, enrichment runs with the `--definitions-once-per-page` flag, so each term tooltip is injected at most once per "deel" instead of at every occurrence.

## Statistics

The DPIA/Pre-scan begrippenkader currently contains 456 definitions; the IAMA begrippenkader (`begrippenkader_iama.yaml`) contains 95 definitions from the Algoritmekader.

---
name: DPIA Kennis
description: Use when answering questions about DPIA concepts, privacy terminology, prescan logic, "wat betekent...", "definitie van...", assessment evaluation rules, report output format, or the relationship between Pre-scan and DPIA assessments.
version: 0.1.0
---

# DPIA Domeinkennis

Knowledge base for DPIA (Data Protection Impact Assessment) and Pre-scan DPIA concepts, logic, and report generation.

## Begrippen Opzoeken

When the user asks about a DPIA term or concept:

1. Search `sources/begrippenkader_dpia.yaml` using Grep for the term (search in `term:` fields, case-insensitive)
2. Present: **term**, **definitie**, **toelichting** (if available), **kennisbronnen**
3. Check for cross-references: terms in `[vierkante haken]` in the definition link to other begrippen — offer to look those up too
4. The begrippenkader contains 456 definitions — do NOT load it fully into context, always search

Example search:
```
Grep pattern: "term: .*verwerker" in sources/begrippenkader_dpia.yaml
```

## DPIA Rapportagemodel Structuur

The DPIA (`sources/dpia.yaml`) follows the Rijksmodel DPIA v3.0 with 17 official paragraphs:

| # | Paragraaf | Task ID |
|---|-----------|---------|
| - | Inleiding | 0 |
| 1 | Voorstel | 1 |
| 2 | Persoonsgegevens | 2 |
| 3 | Gegevensverwerking | 3 |
| 4 | Technieken en methoden | 4 |
| 5 | Doeleinden | 5 |
| 6 | Betrokken partijen | 6 |
| 7 | Betrokkenen | 7 |
| 8 | Bewaartermijn | 8 |
| 9 | Beveiliging | 9 |
| 10 | Doorgifte | 10 |
| 11 | Grondslag | 11 |
| 12 | Transparantie | 12 |
| 13 | Doelbinding | 13 |
| 14 | Dataminimalisatie | 14 |
| 15 | Rechten van de betrokkene | 15 |
| 16 | Risico-analyse | 16 |
| 17 | Maatregelen | 17 |
| - | Management Summary | 18 |
| - | Metadata | 19 |
| - | Ondertekening | 20 |

Tasks with `is_official_id: true` correspond to the numbered paragraphs in the official report.

## IAMA Structuur

The IAMA (Impact Assessment Mensenrechten en Algoritmes) v2.0 (`sources/iama.yaml`, urn `urn:nl:iama`) helps government organisations assess the impact of an algorithm on human rights and public values *before* developing or deploying it. It applies to AI systems and to non-AI algorithmic systems alike.

It is structured in **Delen** (parts), each with its own action points ("Actiepunten"):

| Deel | Titel | Focus |
|------|-------|-------|
| 0 | Inleiding | Toepassing, toepassingsbereik, instructie |
| 1 | Waarom? | Aanleiding/doelstelling, publieke waarden, wettelijke grondslag, verantwoordelijkheden |
| 2 | Wat? | Het algoritme zelf: data, techniek, totstandkoming |
| 3 | Hoe? | Gebruikscontext, rol van de medewerker, impact op betrokkenen (output) |
| 4 | Mensenrechten | Grondrechtentoets (FRIA) — impact op grondrechten en rechtvaardiging van inbreuken |
| 5 | Afsluiting | Belangenafweging, eindadvies, samenvatting van actiepunten |

Key concepts:
- **Grondrechten / FRIA** — Deel 4 is the Fundamental Rights Impact Assessment. Questions that correspond to a requirement from **art. 27 van de AI-verordening** are flagged in the YAML with `in_fria: true` (and shown with an "art. 27 AI-verordening"-icon in the UI).
- **Actiepunten** — each deel has an `action_point_group: true` task collecting its action points; Deel 5 carries `action_point_summary: true` to summarise them all.
- **Verhouding tot de Pre-scan** — the Pre-scan can *advise* an IAMA (see the IAMA row under [Assessment Evaluatie](#assessment-evaluatie)) when the impact on grondrechten needs to be mapped.
- The IAMA is a tool for interdisciplinary dialogue and decision-making, not a checklist; it concludes with an advice on whether and under which conditions the algorithm should be deployed.

When looking up IAMA terminology, search `sources/begrippenkader_iama.yaml` (definitions from the Algoritmekader) rather than the DPIA begrippenkader.

## Pre-scan Logica

The Pre-scan (`sources/prescan.yaml`) determines which assessments are required based on answers.

### Risicoscore-berekening

Scores are calculated per category using jexl expressions:

- **Gewone persoonsgegevens**: count of selected items → score 0 (< 6) or 1 (>= 6)
- **Bijzondere persoonsgegevens**: count → score 0/1/2
- **Gevoelige persoonsgegevens**: count → score 0/1/2
- **Betrokkenen**: weighted count based on type
- **Aantal betrokkenen**: scale-based score
- **Frequentie verwerking**: frequency-based score
- **Bewaartermijn**: duration-based score
- **Internationale doorgifte**: if applicable, adds score
- **Basisregistratie**: if applicable, adds score
- **Digitale dienst minderjarigen**: if applicable, adds score

### Assessment Evaluatie

| Assessment | Verplicht als | Aanbevolen als |
|------------|--------------|----------------|
| **DPIA** | Nieuwe wetgeving OR risicoscore > 4 OR >= 1 AP-lijst item OR >= 2 EDPB-lijst items | Precies 1 EDPB-lijst item |
| **DTIA** | Internationale doorgifte + specifiek doorgifte-mechanisme | - |
| **IAMA** | - | Hoog-risico AI-systeem OR impactvol algoritme (om de impact op grondrechten in kaart te brengen) |

The full evaluation rules are in the `assessments:` section at the bottom of `sources/prescan.yaml`.

## Reference Pre-scan ↔ DPIA

Pre-scan fields link to DPIA paragraphs via `references`:

```yaml
references:
  prescanModelId: "1"           # Pre-scan Model paragraph number
  DPIA:
    - id: "1.1"                 # DPIA task ID
      type: "one-to-one"        # Mapping type
```

### Mapping Types

| Type | Meaning |
|------|---------|
| `one-to-one` | Pre-scan answer maps directly to one DPIA field |
| `one-to-many` | Pre-scan answer feeds into multiple DPIA fields |
| `many-to-one` | Multiple pre-scan answers combine into one DPIA field |

When filling in the Pre-scan, answers are prepared for transfer to the full DPIA via these references.

## Rapportage-export

### Markdown Export

Generated by `packages/assessment-core/src/utils/markdownExport.ts`:

- **DPIA**: metadata section first, then management summary, then numbered official paragraphs (1-17)
- **Pre-scan**: numbered sections sequentially
- **Repeatable tasks**: exported as markdown tables with `| Vraag | Antwoord |` columns
- **Instance labels**: rendered from `instance_label_template` (e.g. "Gegevensverwerking {4.1.1}")
- **Value formatting**:
  - `true` → "Ja"
  - `false` → "Nee"
  - Arrays → bullet list (`- item`)
  - Null/empty → "*Niet ingevuld*"
- **Definitions stripped**: `getPlainTextWithoutDefinitions()` removes `<span class="aiv-definition">` HTML before export

### PDF Export

Generated by `packages/assessment-core/src/utils/pdfExport.ts` using pdfmake:

- **Cover page**: title + generation date
- **Table of contents**: auto-generated
- **Font**: RijksoverheidSansText
- **Format**: A4, 70px margins all sides
- **Pre-scan PDF**: includes extra "Resultaten" section at the beginning with assessment outcomes and explanations
- **Repeatable tasks**: rendered as tables (35% question / 65% answer column width)
- **Styling**: header color `#154273` (RVO blue), section descriptions in grey italic

### Conditional Visibility

`shouldShowTask()` checks dependencies — hidden fields (based on conditional dependencies) are excluded from both markdown and PDF export. The report only contains visible, relevant content.
